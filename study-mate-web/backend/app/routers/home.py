"""工作区主页：全工作区导出的阅读端 SPA 入口（app/exporter.export_workspace_home，按需刷新）。

gen_home 主页渲染已随 python 引擎退役；主页 = 上游导出应用自带的首页。
`/api/home/{file_path}` 仍把工作区根作为只读文件根（旧产物时代的相对引用兜底），
路径越出即拒。
"""
from __future__ import annotations

from contextlib import contextmanager

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .. import curriculum_store as cs
from .. import exporter, workspace_ctx
from ..common import optional_workspace

router = APIRouter(prefix="/api", tags=["home"])


@contextmanager
def _scope(workspace: str | None):
    """显式 `?workspace=` 才改绑定；未传保留调用者已绑定的工作区（不 bind(None) 清掉）。"""
    if workspace is None or not str(workspace).strip():
        yield
        return
    with workspace_ctx.bind(optional_workspace(str(workspace))):
        yield


CONTENT_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".gif": "image/gif",
    ".woff2": "font/woff2",
}


@router.get("/home")
def get_home(workspace: str | None = None) -> FileResponse:
    """工作区主页。node 模式 = 全工作区导出入口（按需刷新）；python 模式 = <ws>/index.html。

    可选 `?workspace=` 指定工作区。
    """
    with _scope(workspace):
        try:
            entry = exporter.export_workspace_home()["entry"]
        except exporter.ExportError as exc:
            raise HTTPException(502, str(exc)) from None
        return FileResponse(entry, media_type="text/html")


@router.get("/home/reading")
def get_home_reading(workspace: str | None = None) -> dict:
    """「我的课程」嵌入入口：按需导出全工作区（源没变复用缓存）并返回 iframe 用 URL。

    与 /api/courses/{slug}/reading 同契约：前端只认返回的 url，不自行拼产物内部
    路径。必须注册在 /home/{file_path:path} 之前，否则被通配吃掉。
    """
    with _scope(workspace):
        try:
            result = exporter.export_workspace_home()
        except exporter.ExportError as exc:
            raise HTTPException(502, str(exc)) from None
    return {
        "url": "/api/exports/_home/index.html",
        "entry": result["entry"],
        "fresh": result["fresh"],
        "engine": result["engine"],
    }


@router.get("/home/{file_path:path}")
def get_home_file(file_path: str, workspace: str | None = None) -> FileResponse:
    """工作区根下的任意文件（主页相对引用由此解析）：词法 + 解析后双重越界防护。"""
    name = file_path.replace("\\", "/")
    if name.startswith("/") or ".." in name.split("/"):
        raise HTTPException(400, "路径非法")
    with _scope(workspace):
        base = cs.workspace_dir().resolve()
        target = (base / name).resolve()
        if target != base and base not in target.parents:
            raise HTTPException(400, "路径越出工作区")
        if not target.is_file():
            raise HTTPException(404, f"文件不存在：{file_path}")
    media_type = CONTENT_TYPES.get(target.suffix.lower(), "application/octet-stream")
    return FileResponse(target, media_type=media_type)
