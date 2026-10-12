"""M4 科目生成：curriculum-designer 派工 → build.run_curriculum_gate 统一门禁（node 引擎）。

统一门禁执行复用 `build.run_curriculum_gate`，派工提示词内联 schema 约束。
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from .. import build as build_svc
from .. import curriculum_store as cs
from .. import roles
from .. import workspace_ctx
from ..common import optional_workspace
from ..llm import is_fixture_mode
from ..models import GenerateCourseRequest

router = APIRouter(prefix="/api", tags=["generate"])


def _generate_user_prompt(payload: GenerateCourseRequest) -> str:
    """派工值：学习者情况逐项内联，内联核心 schema 约束提高首次生成合规率。"""
    project = (payload.project or "").strip() or "未定（设计时预留可挂项目的实操素材）"
    carrier = (payload.carrier or "").strip() or "未定（实验任务写成与载体无关的可执行任务书）"
    return "\n".join(
        [
            "【本课任务】为下面的科目设计课程大纲（课程 DAG，JSON 交回 `data` 键）。",
            f"【科目名】{payload.name.strip()}",
            f"【学习目的】{payload.purpose.strip()}",
            f"【程度目标】{payload.level.strip()}",
            f"【前置基础】{payload.background.strip()}",
            f"【配套项目】{project}",
            f"【实验载体】{carrier}",
            "【输出契约】data 键 = {\"nodes\": [...], \"edges\": [...]}, 节点字段全量以 schemas/curriculum.schema.json 为准。",
            "【硬约束】",
            "- 节点 id 只能由小写字母、数字组成，段间用 `.` 或 `-` 分隔（如 net.layers），禁止大写字母；",
            "- 每个节点必填字段：id、title、objective、prerequisites、status、kind（kind 取 概念/实操/实验）；",
            "- 每条 edge 必填字段：from、to、reason（reason 说明设边理由）；",
            "- concepts、pitfalls 是字符串数组；realworld 必须是字符串（不是数组）；",
            "- nodes 顺序即教学顺序，依赖必须指向前置节点（禁止逆向依赖与环）。",
        ]
    )


def _gate_failure(problems: list[str]) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"detail": "大纲未通过上游门禁", "problems": problems},
    )


@router.post("/courses/generate")
async def generate_course(payload: GenerateCourseRequest, workspace: str | None = None):
    """M4 向导：可选 `?workspace=` 指定落点工作区（不传则发现链的工作区）。"""
    if workspace is None or not str(workspace).strip():
        return await _generate_course_impl(payload)
    # 只有显式传值才改绑定：未传时保留调用者已绑定的工作区，不 bind(None) 清掉它
    with workspace_ctx.bind(optional_workspace(str(workspace))):
        return await _generate_course_impl(payload)


async def _generate_course_impl(payload: GenerateCourseRequest):
    name = payload.name.strip()
    purpose = payload.purpose.strip()
    level = payload.level.strip()
    background = payload.background.strip()
    if not name or not purpose or not level or not background:
        raise HTTPException(422, "name、purpose、level、background 均不能为空")
    if payload.slug is not None:
        if not cs.is_valid_slug(payload.slug):
            raise HTTPException(422, "slug 格式非法：只允许小写字母、数字，用连字符分隔")
        slug = payload.slug
    else:
        slug = cs.generate_slug(name)
    if cs.subject_dir(slug).exists():
        raise HTTPException(409, f"slug 已存在：{slug}")
    if not is_fixture_mode():
        from ..common import require_provider

        provider = require_provider()
    else:
        provider = {"model": "fixture", "api_format": "openai_chat"}
    try:
        envelope = await roles.dispatch_role(
            provider, "generate", _generate_user_prompt(payload), fixture_kind="generate"
        )
    except HTTPException:
        raise  # 技能缺失 503 等原样透传，不吞成 502
    except ValueError as exc:
        raise HTTPException(502, str(exc)) from None
    except Exception as exc:  # noqa: BLE001 - 上游错误统一转 502
        raise HTTPException(502, f"大纲生成请求失败：{type(exc).__name__}: {exc}") from None

    data = envelope.get("data")
    if not isinstance(data, dict) or not isinstance(data.get("nodes"), list) or not isinstance(data.get("edges"), list):
        raise HTTPException(502, "大纲派工没有交回课程 JSON（data 键）")

    # 统一复用 build 模块的完整门禁校验（进程内 schema + node 引擎上游校验器）
    gate_problems = await build_svc.run_curriculum_gate(data)
    if gate_problems:
        problem_msgs = [str(p.get("message") or p) for p in gate_problems[:20]]
        return _gate_failure(problem_msgs)

    summary = cs.create_subject(name, slug, purpose)
    if summary is None:
        raise HTTPException(409, f"slug 已存在：{slug}")
    cs.save_curriculum(slug, data)
    return {"summary": cs.subject_summary(slug), "curriculum": data}
