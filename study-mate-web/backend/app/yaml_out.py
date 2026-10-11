"""后端 YAML 写出的统一出口（所有 safe_dump 调用点只许走这里）。

两个上游 TS 解析器不认的毒（见 docs/StudyMate-Web_引擎复用与回流.md §3）：
1. 默认 width=80 把长字符串折成多行 plain / 引号标量 —— `width=10**9` 止血；
2. **值本身含真实换行**：pyyaml 必然写出跨行引号标量，width 管不了 —— 对这类值
   强制双引号 style（上游解析器支持单行双引号的 `\\n` 转义，实测见金样测试
   `test_golden_yaml_with_newline_round_trips_through_node`）。
块标量 `|`/`>` 上游也不支持，不许用。

2026-10-10 定型：新代码一律 `from .yaml_out import dump_yaml`，别再直接调
yaml.safe_dump——漏一个参数就是给下游导出埋雷（历史教训正是这么来的）。
"""
from __future__ import annotations

from typing import Any

import yaml


def _represent_str(dumper: yaml.SafeDumper, data: str) -> Any:
    style = '"' if "\n" in data else None
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style=style)


yaml.add_representer(str, _represent_str, Dumper=yaml.SafeDumper)


def dump_yaml(data: Any) -> str:
    """归一格式（单行标量、双引号转义换行、保序、Unicode 直出）的 YAML 文本。"""
    return yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=10**9)
