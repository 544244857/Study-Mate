"""文件系统目录枚举：给前端「选择工作区目录」弹窗列出可选的一级子目录。"""
from __future__ import annotations

import os
import string

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["fs"])

# 只列目录不列文件、只读，信任模型与整体 API 相同（本机单人、未加鉴权）不得公开部署。
MAX_DIRS = 500


def _roots() -> list[str]:
    """根列表：Windows 逐个探存在的盘符；其余平台为 "/"。"""
    if os.name == "nt":
        return [
            f"{letter}:\\"
            for letter in string.ascii_uppercase
            if os.path.exists(f"{letter}:\\")
        ]
    return ["/"]


@router.get("/fs/dirs")
def list_dirs(path: str | None = None) -> dict:
    """列出 `path` 的一级子目录（path 缺省或为空时列出根）；只读、只列目录。"""
    if path is None or not path.strip():
        return {"path": "", "dirs": _roots(), "truncated": False}
    expanded = os.path.expanduser(path.strip())
    if not os.path.isabs(expanded):
        raise HTTPException(400, "请提供绝对路径")
    if not os.path.isdir(expanded):
        raise HTTPException(404, f"目录不存在：{path}")
    entries: list[tuple[str, str]] = []
    with os.scandir(expanded) as iterator:
        for entry in iterator:
            if entry.name.startswith("."):
                continue
            if not entry.is_dir():
                continue
            entries.append((entry.name, os.path.join(expanded, entry.name)))
    entries.sort(key=lambda item: item[0].casefold())
    truncated = len(entries) > MAX_DIRS
    dirs = [absolute for _, absolute in entries[:MAX_DIRS]]
    return {"path": expanded, "dirs": dirs, "truncated": truncated}
