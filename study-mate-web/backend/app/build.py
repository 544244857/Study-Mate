"""建课编排（§5.1 D 行 2026-10-03 拍板）：草稿区里跑「大纲 + 采图并行 → 门禁 → 落盘」。

大纲 = curriculum-designer 派工（SKILL.md 全文注入，输出 JSON 图，`data` 键交回）；
采图 = image_scout（纯后端爬虫），两支并行（learning-system「建池与拟大纲并行」）。
门禁 = 上游引擎 sm-validate（权威）+ cs.validate_curriculum（本地结构化补充，两边都跑合并去重），
打回与工单规则同产课链；进度经 emit 回吐进会话。
"""
from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Any, Awaitable, Callable

import yaml

from . import audit
from . import curriculum_store as cs
from . import draft as draft_svc
from . import engine_node
from . import image_scout, roles, tickets as tickets_svc
from . import workspace_ctx
from .config import SCRIPTS_DIR, engine_schema_path
from .produce import fixture_curriculum_envelope, is_draft
from .yaml_out import dump_yaml

MAX_RETRIES = 2
Event = dict[str, Any]
Emit = Callable[[Event], Awaitable[None]]


def interview_of(base: Path) -> dict[str, Any]:
    """盘问结果存在 subject.yaml 的六个键里（create_draft 落盘）。"""
    subject = draft_svc.get_draft(base.name) or {}
    return {
        "name": subject.get("name", ""),
        "purpose": subject.get("goal", ""),
        "level": subject.get("level", ""),
        "background": subject.get("background", ""),
        "project": subject.get("project", ""),
        "carrier": subject.get("carrier", ""),
    }


def _curriculum_schema_text() -> str:
    """读大纲 schema 全文用于内联派工值；文件缺失时安全回落（不因缺文件而炸）。

    工具循环沙箱的 read_roots 只有草稿目录，模型自己读不到引擎 schema——实测只能靠猜，
    门禁连续打回（节点 id 大写、edges 缺 reason、realworld 类型错）。把全文内联进派工值
    才真正可达。

    读的是**包内** schema（规则单源），与门禁 `sm-validate curriculum` 判定用的是同一份：
    早先读仓库根那份旧基线（六档 status + mastery），模型照它写出来的值会被包内三档
    schema 拦下，提示词与门禁互相打架。
    """
    path = engine_schema_path("curriculum.schema.json")
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return (
            f"（引擎 schema 缺失：{path}——先在 engine-node 里跑 `node setup.mjs`；"
            "节点必填键：id、title、objective、prerequisites、status、kind，"
            "边必填键：from、to、reason，realworld 必须是字符串）"
        )


def curriculum_values(base: Path, interview: dict[str, Any]) -> str:
    """大纲派工值：盘问结果 + 资源清单（值内联，规格是权威）。"""
    resources = base / "RESOURCES.md"
    return "\n".join(
        [
            "【本课任务】为下面的科目设计课程大纲（课程 DAG，JSON 交回 `data` 键）。",
            f"【科目名】{interview.get('name', '')}",
            f"【学习目的】{interview.get('purpose', '')}",
            f"【程度目标】{interview.get('level', '')}",
            f"【前置基础】{interview.get('background', '')}",
            f"【配套项目】{interview.get('project') or '未定（设计时预留可挂项目的实操素材）'}",
            f"【实验载体】{interview.get('carrier') or '未定（实验任务写成与载体无关的可执行任务书）'}",
            "【输出契约】data 键 = {\"nodes\": [...], \"edges\": [...]}，"
            "节点字段全量以引擎 schema（curriculum.schema.json）为准（全文已内联在下方，规格是权威）。",
            "【硬约束（逐条核对）】节点 id 必须匹配 ^[a-z0-9]+([.-][a-z0-9]+)*$"
            "（小写字母/数字，`.` 或 `-` 分隔，不能有大写字母，如 `nE1` 非法）；"
            "节点必填键：id、title、objective、prerequisites、status、kind；"
            "边（edges）必填键：from、to、reason（reason 必须有）；"
            "realworld 必须是字符串（不是数组）。",
            "",
            "【引擎 schema（curriculum.schema.json）全文】",
            _curriculum_schema_text(),
            "",
            "【资源清单】",
            resources.read_text(encoding="utf-8") if resources.is_file() else "（资源清单未建）",
        ]
    )


def _gate_problems(stdout: str, stderr: str) -> list[dict[str, str]]:
    problems: list[dict[str, str]] = []
    for chunk in (stdout, stderr):
        for raw in chunk.splitlines():
            line = raw.strip()
            if not line:
                continue
            if line.startswith("- "):
                problems.append({"path": "curriculum.yaml", "line": "", "message": line[2:].strip()})
            elif "[ERROR]" in line or line.startswith("schema"):
                problems.append({"path": "curriculum.yaml", "line": "", "message": line})
    for problem in problems:
        problem["owner"] = roles.owner_of(str(problem["path"]))
    return list({p["message"]: p for p in problems}.values())[:20]


async def run_curriculum_gate(data: dict[str, Any]) -> list[dict[str, str]]:
    """大纲门禁：上游引擎判定（权威）+ 本地结构化补充检查，两边都跑，问题合并去重，上限 20。

    2026-10-11 同步上游后改口径：cs.validate_curriculum 降为结构化补充检查
    （id/前置/edges 完整性），权威 enum 在引擎包内 schema——旧逻辑「本地有问题就
    return」会让上游门禁根本不跑，本地旧口径还会单方面打回上游认可的合法值
    （如三档 `已学完`）。上游不可用/失败仍按问题报出，绝不静默放行。
    """
    upstream = await _gate_via_node(data)
    local = [
        {"path": "curriculum.yaml", "line": "", "message": p, "owner": roles.owner_of("curriculum.yaml")}
        for p in cs.validate_curriculum(data)
    ]
    merged: dict[str, dict[str, str]] = {}
    for problem in upstream + local:
        merged.setdefault(problem["message"], problem)
    return list(merged.values())[:20]


def _node_gate_problems(report: dict[str, Any]) -> list[dict[str, str]]:
    """node 校验报告 → 门禁问题清单（schema 级问题上游全部标 blocking）。"""
    return [
        {
            "path": "curriculum.yaml",
            "line": str(problem.get("line") or ""),
            "message": str(problem.get("message") or ""),
            "owner": roles.owner_of("curriculum.yaml"),
        }
        for problem in (report.get("problems") or [])
        if problem.get("blocking")
    ][:20]


async def _gate_via_node(data: dict[str, Any]) -> list[dict[str, str]]:
    """node 门禁：同一份临时大纲交给上游校验器（规则单源 = 上游包）。"""
    if not engine_node.available():
        return [
            {
                "path": "curriculum.yaml",
                "line": "",
                "message": "node 引擎未就绪（先在 engine-node 里跑 `node setup.mjs`），或设 STUDYMATE_ENGINE=python 回退",
                "owner": "总控",
            }
        ]
    tmp_name = ""
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", encoding="utf-8", delete=False) as tmp:
            tmp.write(dump_yaml(data))
            tmp_name = tmp.name
        report = await asyncio.to_thread(engine_node.validate_data, "curriculum", Path(tmp_name))
    except (OSError, engine_node.EngineNodeError) as exc:
        return [{"path": "curriculum.yaml", "line": "", "message": f"node 门禁失败：{exc}", "owner": "总控"}]
    finally:
        if tmp_name:
            Path(tmp_name).unlink(missing_ok=True)
    if report.get("blocking"):
        problems = _node_gate_problems(report)
        return problems or [
            {"path": "curriculum.yaml", "line": "", "message": "node 门禁判定阻断但未给出问题清单", "owner": "总控"}
        ]
    return []



async def _dispatch_curriculum(
    provider: dict[str, Any], values: str, emit: Emit
) -> dict[str, Any] | None:
    """大纲派工：contract 失败（模型偶发畸形 JSON）原值重派，耗尽转 error。

    这是 10-03 核实过的建课链缺口：产课链已有原值重派兜底，建课链过去一次
    不合规就硬停；这里补齐同样的兜底（§5.1 K2）。
    """
    from .llm import is_fixture_mode

    if is_fixture_mode():
        return fixture_curriculum_envelope(values)
    owner = "课设"
    last: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            return await roles.dispatch_role(provider, "generate", values, fixture_kind="generate")
        except ValueError as exc:
            last = exc
            if attempt >= MAX_RETRIES:
                break
            await emit(
                {
                    "event": "retry",
                    "round": attempt + 1,
                    "owners": [owner],
                    "reason": f"{owner}交付不合规，原值重派",
                    "problems": [
                        {
                            "path": "（generate 派工）",
                            "line": "",
                            "message": str(exc),
                            "owner": owner,
                        }
                    ],
                }
            )
    await emit(
        {"event": "error", "message": f"{owner}连续 {MAX_RETRIES + 1} 次交付不合规，已停止：{last}"}
    )
    return None


async def run_build(slug: str, provider: dict[str, Any], emit: Emit) -> None:
    """建课编排。事件：stage / retry / handoff / done / error。产物落草稿区。"""
    audit.bind(f"build-{slug}")
    base = draft_svc.draft_dir(slug)
    if draft_svc.get_draft(slug) is None:
        await emit({"event": "error", "message": f"草稿不存在：{slug}"})
        return
    stage_root = base / ".stage"
    try:
        interview = interview_of(base)
        values = curriculum_values(base, interview)

        # 「建池与拟大纲并行」：大纲派工（含门禁打回）与采图两支并发
        curriculum_task = asyncio.create_task(_curriculum_chain(slug, values, provider, emit))
        scout_task = asyncio.create_task(image_scout.scout_images(base, emit))
        data = await curriculum_task
        await scout_task
        if data is None:
            return
        await emit({"event": "stage", "stage": "落盘", "status": "start"})
        draft_svc.save_draft_curriculum(slug, data)
        progress = draft_svc.draft_progress(slug)
        first = next((n for n in data.get("nodes") or [] if isinstance(n, dict) and n.get("id")), None)
        # 只补默认首节点，不覆盖已有进度：重跑建课/重试不得把已推进的节点状态清空。
        nodes_progress = progress.setdefault("nodes", {})
        if first:
            # 三档词表（规格 §5.2）：mastery 不再写初始 0——掌握度字段已取消，
            # 展示端对缺值自带 0 回退，新文件不该再长出这个键。
            nodes_progress.setdefault(first["id"], {"status": "学习中"})
        progress.setdefault("project", {})["current"] = str(interview.get("project") or "")
        draft_svc.save_draft_progress(slug, progress)
        await emit({"event": "stage", "stage": "落盘", "status": "done"})
        await emit(
            {
                "event": "done",
                "slug": slug,
                "stage": "build",
                "message": "建课完成：大纲已过门禁，课程以草稿态备好，落点确认后进入工作区。",
            }
        )
    finally:
        roles.clear_stage(stage_root)


async def _curriculum_tool_loop(
    slug: str, base: Path, values: str, provider: dict[str, Any], emit: Emit
) -> dict[str, Any] | None:
    """K2：大纲角色走工具循环（读参考 → submit_curriculum → 门禁报错回喂自修）。

    返回交回并通过门禁的大纲；未交回（循环耗尽/降级）返回 None，由调用方回落
    既有单次派工链。后端在循环之后再强制跑一次门禁（不信任模型自查，K 系列不变量）。
    """
    from . import agent as agent_svc
    from . import prompts
    from . import tools as tools_svc

    system_text, missing = prompts.inject_role("generate", tools_enabled=True)
    if missing:
        await emit({"event": "error", "message": f"角色技能规范缺失：{'、'.join(missing)}"})
        return None
    ctx = tools_svc.ToolContext(read_roots=[base], write_roots=[], label="建课草稿", state={})
    messages = [
        {"role": "system", "content": system_text},
        {"role": "user", "content": values},
    ]
    audit.record("dispatch", route="generate", loop="tools", values=values)

    async def on_progress(snapshot: dict[str, Any]) -> None:
        """进度快照 → SSE progress：编排卡显示「第 N 轮 · 已等待 Ns」，证明"确实在工作"。"""
        await emit({"event": "progress", "stage": "大纲", **snapshot})

    async def on_event(event: dict[str, Any]) -> None:
        name = str(event.get("name") or "")
        if event["type"] == "tool_call" and name == "submit_curriculum":
            # 循环内自检（模型提交即跑、拿报错自修）；后端收尾还会强制跑一次真门禁，
            # 两者在事件流里区分：这里是「大纲自检」。
            await emit({"event": "stage", "stage": "大纲自检", "status": "start"})
        elif event["type"] == "tool_result" and name == "submit_curriculum":
            await emit(
                {
                    "event": "stage",
                    "stage": "大纲自检",
                    "status": "done" if not event.get("is_error") else "fail",
                }
            )

    outcome = await agent_svc.run_agent(
        agent_svc.real_turn_source(provider),
        messages,
        ctx,
        on_event,
        tools_svc.schemas(tools_svc.BUILD_TOOLS),
        audit_meta={"kind": "build", "slug": slug, "model": str(provider.get("model") or "")},
        max_seconds=agent_svc.ORCH_MAX_SECONDS,
        on_progress=on_progress,
    )
    if outcome.degraded:
        audit.record("build_loop_degraded", slug=slug, reason=outcome.stopped_reason)
    return ctx.state.get("curriculum")


async def _curriculum_chain(
    slug: str, values: str, provider: dict[str, Any], emit: Emit
) -> dict[str, Any] | None:
    """大纲派工 + 门禁打回（上限 MAX_RETRIES 轮）；通过返回课程数据，耗尽建工单。"""
    from .llm import is_fixture_mode, supports_tools

    base = draft_svc.draft_dir(slug)
    envelope: dict[str, Any] | None = None
    # 工具调用默认对所有配置的模型开启（2026-10-04）：真实模型走大纲工具循环；
    # fixture 模式保持单次派工（E2E 稳定）。
    if not is_fixture_mode() and supports_tools(provider):
        data = await _curriculum_tool_loop(slug, base, values, provider, emit)
        if data is not None:
            envelope = {"files": [], "data": data, "report": {}}
    if envelope is None:
        envelope = await _dispatch_curriculum(provider, values, emit)
    for round_no in range(MAX_RETRIES + 1):
        if envelope is None:
            return None
        data = envelope.get("data") if isinstance(envelope, dict) else None
        if not isinstance(data, dict) or not isinstance(data.get("nodes"), list):
            await emit({"event": "error", "message": "大纲派工没有交回课程 JSON（data 键）"})
            return None
        await emit({"event": "stage", "stage": "交付检查", "status": "start"})
        problems = await run_curriculum_gate(data)
        if not problems:
            await emit({"event": "stage", "stage": "交付检查", "status": "done"})
            return data
        await emit({"event": "stage", "stage": "交付检查", "status": "fail", "problems": problems})
        if round_no == MAX_RETRIES:
            ticket = tickets_svc.create_ticket(
                kind="build",
                slug=slug,
                node_id=None,
                base_label="draft" if is_draft(base) else "workspace",
                problems=problems,
                artifacts=["curriculum.yaml"],
                # 建课工单记录本次建课所属工作区（promote 的落点就是这个工作区）。
                workspace=str(workspace_ctx.resolve()),
            )
            await emit({"event": "handoff", "ticket": ticket})
            await emit(
                {"event": "error", "message": f"大纲未过上游门禁，已转人工（工单 {ticket['id']}）。"}
            )
            return None
        # 归属取真正的问题归属（此前硬编码 ["出题"]，与 problems 的 owner 矛盾——大纲问题
        # 归 curriculum-designer，即「课设」；只有产课链的部分问题才归出题）
        owners = sorted({str(p.get("owner") or "课设") for p in problems}) or ["课设"]
        await emit({"event": "retry", "round": round_no + 1, "owners": owners, "problems": problems})
        evidence = values + "\n\n【上一稿门禁报错（逐条原文，改到没有为止）】\n" + "\n".join(
            f"- {p['message']}" for p in problems
        )
        envelope = await _dispatch_curriculum(provider, evidence, emit)
    return None
