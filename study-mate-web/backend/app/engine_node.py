"""node 侧引擎调用层：后端进 engine-node 三个 CLI 的唯一入口。

这一层只做三件事：找 node 可执行、按超时跑子进程、把 stdout 的单行 JSON 解出来。
规则全在 engine-node/（上游 npm 包），数据判定不在这里做——exit 2（有阻断问题）是
**数据结论**不是错误，照常把报告返回给调用方；exit 1 / 启动失败 / JSON 解不开才抛
EngineNodeError。引擎主链只有 node 一条路（python 渲染链已随批 5 退役）。
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .config import (
    ENGINE_NODE_DIR,
    SM_EXPORT_MJS,
    SM_VALIDATE_MJS,
    SM_WORKSPACE_MJS,
)

# 超时按实测余量定：导出全工作区 ~0.4s、单课校验 ~0.5s（含 node 启动）
EXPORT_TIMEOUT = 60
VALIDATE_TIMEOUT = 15
WORKSPACE_TIMEOUT = 15


class EngineNodeError(RuntimeError):
    """CLI 自身错误（启动失败 / 超时 / exit 1 / 输出解不开）。数据阻断不在此列。"""



def node_executable() -> str | None:
    return shutil.which("node")


def available() -> bool:
    """node 可执行 + vendor 产物齐全。不齐时调用方应回落冻结 Python（旁路静默跳过）。"""
    return (
        node_executable() is not None
        and (ENGINE_NODE_DIR / "vendor" / "studymate" / "package.json").is_file()
    )


def _run(script: Path, args: list[str], timeout: int) -> tuple[int, str, str]:
    node = node_executable()
    if node is None:
        raise EngineNodeError("找不到 node 可执行文件（engine-node 需要 node ^22.19 或 >=24）")
    if not script.is_file():
        raise EngineNodeError(f"CLI 缺失：{script}（先在 engine-node 里跑 `node setup.mjs`）")
    try:
        proc = subprocess.run(
            [node, str(script), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"},
            cwd=str(ENGINE_NODE_DIR),
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise EngineNodeError(f"{script.name} 启动失败或超时：{exc}") from exc
    return proc.returncode, proc.stdout or "", proc.stderr or ""


def _json_report(stdout: str) -> dict[str, Any]:
    """取 stdout 末段 `{` 开头的一行解成 JSON；解析不出按自身错误抛。"""
    for line in reversed(stdout.strip().splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                break
    raise EngineNodeError(f"CLI 没有输出 JSON 报告：{stdout[:200]!r}")


def _validated(script: Path, args: list[str]) -> dict[str, Any]:
    """校验类 CLI 的公共路径：exit 0/2 都把报告交出去（2 = 数据阻断，调用方看 blocking）。"""
    code, out, err = _run(script, args, VALIDATE_TIMEOUT)
    if code in (0, 2):
        return _json_report(out)
    raise EngineNodeError(f"{script.name} 退出码 {code}：{err.strip()[-400:] or out.strip()[-400:]}")


def validate_lesson(lesson_file: Path, subject_dir: Path | None = None) -> dict[str, Any]:
    """校验一课（格式 + 锚点四态对账 + 图片存在性）。subject_dir 缺省时 CLI 自行向上找。"""
    args = ["lesson", str(lesson_file)]
    if subject_dir is not None:
        args += ["--subject", str(subject_dir)]
    return _validated(SM_VALIDATE_MJS, args)


def validate_data(kind: str, file: Path) -> dict[str, Any]:
    """校验三份数据 YAML 之一（kind: curriculum | progress | subject）。"""
    if kind not in ("curriculum", "progress", "subject"):
        raise ValueError(f"未知校验种类：{kind}")
    return _validated(SM_VALIDATE_MJS, [kind, str(file)])


def export_workspace(
    workspace: Path,
    out: Path,
    subjects: list[str] | None = None,
) -> dict[str, Any]:
    """导出静态阅读应用（全工作区或指定科目）。返回 {ok, entry, files, bytes, ...}。"""
    args = ["--workspace", str(workspace), "--out", str(out), "--json"]
    for slug in subjects or []:
        args += ["--subject", slug]
    code, out_text, err = _run(SM_EXPORT_MJS, args, EXPORT_TIMEOUT)
    if code == 0:
        return _json_report(out_text)
    raise EngineNodeError(f"导出失败（退出码 {code}）：{err.strip()[-400:] or out_text.strip()[-400:]}")


def discover_workspace() -> Path | None:
    """node 侧工作区发现；解析不到返回 None（调用方兜底默认值）。"""
    code, out, _err = _run(SM_WORKSPACE_MJS, [], WORKSPACE_TIMEOUT)
    line = out.strip().splitlines()[-1] if out.strip() else ""
    return Path(line) if code == 0 and line else None
