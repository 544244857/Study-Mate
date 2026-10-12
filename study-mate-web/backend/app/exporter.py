"""静态导出动作：按引擎模式分派，产物统一落 `data/exports/<slug>/`。

两种模式的产物结构不同（node = 上游 `sm-export` 的自包含阅读端 SPA；
python = 冻结 `gen_home.py` 的主页 + `.learning/subjects/…`），消费方**一律**
通过 reading 入口拿到的 URL 嵌页面，不要自行拼产物内部结构。

新鲜度：源科目目录的最大文件 mtime 对比产物 `.stamp`（导出时刻）——源没变
就直接复用旧产物（按需导出，Spike 实测全工作区 0.39s，不做后台预热）。
半成品防护与旧 export 路由同口径：先在暂存目录导完，成功后才原子替换旧产物。
"""
from __future__ import annotations

import re
import shutil
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from . import curriculum_store as cs
from . import engine_node
from .config import DATA_DIR


class ExportError(RuntimeError):
    """导出失败（调用方转 HTTP 错误）。"""


def export_root_for(slug: str) -> Path:
    return DATA_DIR / "exports" / slug


def source_mtime(subject_dir: Path) -> float:
    """科目目录里最新内容文件的 mtime（跳过 .stage 暂存）。"""
    latest = 0.0
    for path in subject_dir.rglob("*"):
        if not path.is_file() or ".stage" in path.parts:
            continue
        try:
            latest = max(latest, path.stat().st_mtime)
        except OSError:
            continue
    return latest


def is_fresh(subject_dir: Path, export_root: Path) -> bool:
    stamp = export_root / ".stamp"
    if not stamp.is_file():
        return False
    try:
        stamped = float(stamp.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return False
    return stamped >= source_mtime(subject_dir)


def _stamp(export_root: Path) -> None:
    (export_root / ".stamp").write_text(f"{time.time()}\n", encoding="utf-8")


# 同 slug 的并发导出互斥（两个请求同时换入会互踩暂存目录）
_SWAP_LOCKS_GUARD = threading.Lock()
_SWAP_LOCKS: dict[str, threading.Lock] = {}


def _swap_lock(slug: str) -> threading.Lock:
    with _SWAP_LOCKS_GUARD:
        return _SWAP_LOCKS.setdefault(slug, threading.Lock())


def _swap_in(staging: Path, export_root: Path) -> None:
    """暂存目录 → 正式产物。Windows 上 rename 到已存在目录会炸，且被占用的旧文件
    可能让 rmtree 静默残留——先试快速 rename，撞上就清理后重试，最终兜底原地覆盖
    copytree（导出是幂等重生成，覆盖无一致性风险）。"""
    last_error: OSError | None = None
    for attempt in range(3):
        try:
            staging.rename(export_root)
            _stamp(export_root)
            return
        except OSError as exc:
            last_error = exc
            shutil.rmtree(export_root, ignore_errors=True)
            time.sleep(0.2 * (attempt + 1))
    # 兜底：旧目录被占用删不净（Windows 文件锁），直接覆盖拷入
    shutil.copytree(staging, export_root, dirs_exist_ok=True)
    _stamp(export_root)
    shutil.rmtree(staging, ignore_errors=True)


@contextmanager
def _staging(slug: str):
    staging = DATA_DIR / "exports" / f".{slug}.tmp-{uuid.uuid4().hex[:8]}"
    if staging.exists():
        shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)
    try:
        yield staging
    finally:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)


def export_subject(slug: str, *, force: bool = False) -> dict[str, Any]:
    """导出一个科目到 `data/exports/<slug>`；返回 {export_dir, entry, fresh, engine}。

    fresh=True 表示源未变、复用了现有产物（不重导）。失败抛 ExportError。
    """
    subject_dir = cs.subject_dir(slug)
    if not subject_dir.is_dir():
        raise ExportError(f"科目不存在：{slug}")
    export_root = export_root_for(slug)
    if not force and is_fresh(subject_dir, export_root):
        return {
            "export_dir": str(export_root.resolve()),
            "entry": str((export_root / "index.html").resolve()),
            "fresh": True,
            "engine": "cache",
        }

    # 锁在 _export_node 内部拿（与 _staging 同层）——这里再包一层会同线程重入死锁
    return _export_node(slug, subject_dir, export_root)


def export_workspace_home(slug: str = "_home") -> dict[str, Any]:
    """全工作区导出（阅读端 SPA 自带首页），供 /api/home 的 node 模式用。

    node 模式下 gen_home 不再跑、工作区根没有 index.html——主页 = 全工作区
    导出的入口页。python 模式不经过这里（/api/home 直接读 <ws>/index.html）。
    """
    export_root = export_root_for(slug)
    workspace = cs.workspace_dir()
    stamp = export_root / ".stamp"
    if stamp.is_file():
        try:
            if float(stamp.read_text(encoding="utf-8").strip()) >= _workspace_mtime(workspace):
                return {
                    "export_dir": str(export_root.resolve()),
                    "entry": str((export_root / "index.html").resolve()),
                    "fresh": True,
                    "engine": "cache",
                }
        except (OSError, ValueError):
            pass
    if not engine_node.available():
        raise ExportError("node 引擎未就绪（先在 engine-node 里跑 `node setup.mjs`）")
    with _staging(slug) as staging, _swap_lock(slug):
        result = engine_node.export_workspace(workspace, staging)
        _swap_in(staging, export_root)
    return {
        "export_dir": str(export_root.resolve()),
        "entry": str((export_root / "index.html").resolve()),
        "fresh": False,
        "engine": "node",
    }


def _workspace_mtime(workspace: Path) -> float:
    """.learning 下全部内容文件的最新 mtime（全工作区导出的新鲜度源）。"""
    latest = 0.0
    learning = workspace / ".learning"
    if not learning.is_dir():
        return latest
    for path in learning.rglob("*"):
        if not path.is_file() or ".stage" in path.parts or "export" in path.parts:
            continue
        try:
            latest = max(latest, path.stat().st_mtime)
        except OSError:
            continue
    return latest


def _export_node(slug: str, subject_dir: Path, export_root: Path) -> dict[str, Any]:
    if not engine_node.available():
        raise ExportError("node 引擎未就绪（先在 engine-node 里跑 `node setup.mjs`）")
    with _staging(slug) as staging, _swap_lock(slug):
        try:
            engine_node.export_workspace(
                cs.workspace_dir(), staging, subjects=[slug]
            )
        except engine_node.EngineNodeError as exc:
            raise ExportError(str(exc)) from exc
        _swap_in(staging, export_root)
    return {
        "export_dir": str(export_root.resolve()),
        "entry": str((export_root / "index.html").resolve()),
        "fresh": False,
        "engine": "node",
    }


