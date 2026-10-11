"""工作区发现：唯一入口，发现规则走上游 npm 包（sm-workspace CLI，node 引擎）。

优先级（与冻结期 gen_home.py::learn_workspace() 一致）：显式 `STUDYMATE_WORKSPACE` >
`LEARN_WORKSPACE` > `STUDYMATE_CONFIG`/`$DSH_HOME/studymate-config.yaml` 的 workspace
字段 > 插件默认 `~/StudyMate`。中间两级在 engine-node CLI 内实现（Web 不写第二份
发现规则）；node 未就绪或解析不到时兜底插件默认值。
"""
from __future__ import annotations

import logging
import os
import re
from pathlib import Path

from . import engine_node

logger = logging.getLogger(__name__)

DEFAULT_WORKSPACE = Path.home() / "StudyMate"
_source: str | None = None
_fallback: Path | None = None


def config_file_path() -> Path:
    override = os.getenv("STUDYMATE_CONFIG")
    if override:
        return Path(override).expanduser()
    return Path(os.getenv("DSH_HOME") or Path.home() / ".dsh").expanduser() / "studymate-config.yaml"



def _discover_via_engine() -> tuple[Path, str] | None:
    """node 模式：工作区发现走上游 lib/workspace 语义（sm-workspace CLI）。"""
    if not engine_node.available():
        logger.warning("node 引擎未就绪，工作区发现走默认 %s", DEFAULT_WORKSPACE)
        return None
    try:
        found = engine_node.discover_workspace()
    except engine_node.EngineNodeError as exc:
        logger.warning("node 工作区发现失败：%s", exc)
        return None
    if found is None:
        return None
    return found, "node 引擎发现（LEARN_WORKSPACE / studymate-config.yaml）"


def discover() -> tuple[Path, str]:
    """返回 (工作区路径, 来源说明)。env 覆盖每次动态读取，其余结果进程内缓存。"""
    global _source, _fallback
    override = os.getenv("STUDYMATE_WORKSPACE")
    if override:
        return Path(override).expanduser(), "环境变量 STUDYMATE_WORKSPACE"
    if _fallback is None:
        outcome = _discover_via_engine()
        if outcome is not None:
            _fallback, _source = outcome
        else:
            _fallback, _source = DEFAULT_WORKSPACE, "默认（~/StudyMate，未配置）"
    return _fallback, _source or ""


def reset_discovery() -> None:
    global _fallback
    _fallback = None


def candidates() -> list[str]:
    """可切换的工作区候选（当前生效路径、插件默认、env 覆盖值；去重保序）。"""
    out: list[str] = []
    raw = [str(discover()[0]), str(DEFAULT_WORKSPACE), os.getenv("STUDYMATE_WORKSPACE") or ""]
    for item in raw:
        value = str(Path(item).expanduser()) if item.strip() else ""
        if value and value not in out:
            out.append(value)
    return out


def _yaml_scalar(value: str) -> str:
    """YAML 标量安全输出：只有含 YAML 敏感字符时才加引号（普通路径保持无引号原样）。"""
    needs_quote = (
        value != value.strip()
        or any(ch in value for ch in "#\"'")
        or ": " in value
    )
    return "'" + value.replace("'", "''") + "'" if needs_quote else value


def set_configured_workspace(raw: str) -> Path:
    """把 workspace 写进 studymate-config.yaml（行级替换，保留注释与顺序）。"""
    cleaned = (raw or "").strip()
    if not cleaned:
        raise ValueError("工作区路径不能为空")
    if any(ch in cleaned for ch in "\r\n"):
        raise ValueError("工作区路径不能包含换行")
    target = str(Path(cleaned).expanduser().resolve())
    scalar = _yaml_scalar(target)
    cfg_path = config_file_path()
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    lines = cfg_path.read_text(encoding="utf-8").splitlines(keepends=True) if cfg_path.exists() else []
    replaced = False
    out: list[str] = []
    for line in lines:
        if re.match(r"^workspace\s*:", line):
            out.append(f"workspace: {scalar}\n")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        if out and not out[-1].endswith("\n"):
            out[-1] += "\n"
        out.append(f"workspace: {scalar}\n")
    cfg_path.write_text("".join(out), encoding="utf-8")
    reset_discovery()
    return cfg_path
