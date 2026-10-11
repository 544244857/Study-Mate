"""M3 静态工作区导出：按引擎模式分派（动作在 app/exporter.py，这里只留 HTTP 面）。"""
from __future__ import annotations

from contextlib import contextmanager

from fastapi import APIRouter, HTTPException

from .. import curriculum_store as cs
from .. import exporter, workspace_ctx
from ..common import optional_workspace, require_subject

router = APIRouter(prefix="/api", tags=["export"])


@contextmanager
def _scope(workspace: str | None):
    """显式 `?workspace=` 才改绑定；未传保留调用者已绑定的工作区。"""
    if workspace is None or not str(workspace).strip():
        yield
        return
    with workspace_ctx.bind(optional_workspace(str(workspace))):
        yield


def _export_or_502(slug: str, *, force: bool) -> dict:
    try:
        return exporter.export_subject(slug, force=force)
    except exporter.ExportError as exc:
        raise HTTPException(502, str(exc)) from None


@router.post("/courses/{slug}/export")
def export_course(slug: str, workspace: str | None = None) -> dict:
    """强制重导到 data/exports/<slug>；可选 `?workspace=` 指定源工作区。

    pages：python 时代语义是「生成的科目主页数」；node 导出产物是一份阅读端 SPA，
    这里返回它包含的科目数，让「共 N 个页面」的文案两边都成立。
    """
    with _scope(workspace):
        require_subject(slug)
        result = _export_or_502(slug, force=True)
    subjects = result.get("subjects")
    pages = len(subjects) if isinstance(subjects, list) and subjects else 1
    return {
        "ok": True,
        "export_dir": result["export_dir"],
        "index_file": result["entry"],
        "pages": pages,
        "engine": result["engine"],
    }


@router.get("/courses/{slug}/reading")
def get_reading(slug: str, workspace: str | None = None) -> dict:
    """阅读端入口：按需导出（源没变复用缓存）并返回 iframe 用 URL。

    node 模式产物是上游 `sm-export` 的自包含阅读端 SPA（含判分）；
    python 模式产物是 gen_home 主页。前端只认这里返回的 url。
    """
    with _scope(workspace):
        require_subject(slug)
        try:
            result = exporter.export_subject(slug, force=False)
        except exporter.ExportError as exc:
            raise HTTPException(502, str(exc)) from None
    return {
        "url": f"/api/exports/{slug}/index.html",
        "entry": result["entry"],
        "fresh": result["fresh"],
        "engine": result["engine"],
    }
