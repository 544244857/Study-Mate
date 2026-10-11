"""工作区 YAML 卫生探测：给 /api/health 一个低成本排障信号。

只**采样报告**，不自动迁移（学习数据不擅自动）——判定口径与迁移工具一致：
`safe_dump(safe_load(text)) != text` 即「非归一格式」，其中绝大多数是旧默认 width
写出的多行标量（上游 TS 解析器不认，导出会失败），少数可能是手改文件。点名到
`backend/scripts/migrate_yaml.py`，跑 dry-run 看清单再 --apply。

采样上限 + 60s 进程内缓存：health 是高频探针，不能每次全扫。
"""
from __future__ import annotations

import threading
import time
from pathlib import Path

import yaml

from .workspace import discover
from .yaml_out import dump_yaml

MAX_FILES = 50
CACHE_TTL = 60.0

_lock = threading.Lock()
_cache: tuple[float, dict[str, object]] | None = None


def scan_workspace(workspace: Path, limit: int = MAX_FILES) -> dict[str, object]:
    checked = 0
    needs_migration = 0
    sample: list[str] = []
    for path in sorted(workspace.rglob("*.yaml")) + sorted(workspace.rglob("*.yml")):
        if checked >= limit:
            break
        try:
            text = path.read_text(encoding="utf-8")
            data = yaml.safe_load(text)
            normalized = dump_yaml(data) if data is not None else text
        except (OSError, UnicodeError, yaml.YAMLError):
            continue  # 读不了/解不开是另一类问题，由校验器与迁移工具点名，这里只数卫生
        checked += 1
        if normalized != text:
            needs_migration += 1
            if len(sample) < 5:
                sample.append(str(path))
    return {
        "checked": checked,
        "needs_migration": needs_migration,
        "sample": sample,
    }


def snapshot() -> dict[str, object]:
    """health 用的探测快照：带 TTL 缓存；工作区解析不到时如实报 unchecked。"""
    global _cache
    with _lock:
        if _cache is not None and time.monotonic() - _cache[0] < CACHE_TTL:
            return _cache[1]
    try:
        workspace, _source = discover()
    except Exception:  # noqa: BLE001 - health 不允许被探测自身打挂
        result: dict[str, object] = {"checked": 0, "needs_migration": 0, "error": "工作区解析失败"}
        return result
    if not workspace.is_dir():
        result = {"checked": 0, "needs_migration": 0, "error": f"工作区目录不存在：{workspace}"}
    else:
        result = scan_workspace(workspace)
        if result["needs_migration"]:
            result["hint"] = "存在非归一格式 yaml（多为旧多行标量，也可能是含手写注释的文件）；" \
                "跑 backend/scripts/migrate_yaml.py 的 dry-run 看准确清单（它会点名跳过原因），再 --apply"
    with _lock:
        _cache = (time.monotonic(), result)
    return result
