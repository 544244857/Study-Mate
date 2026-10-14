"""状态机六档 → 三档（目标态规格 §5.2）的回归：

1. normalize_status：旧六档读侧映射（与包内 lib/core/rules.ts 的 LEGACY_TIER_MAP 逐条一致），
   不认识的词退回「未开始」；
2. save_progress 写回即收敛：旧六档落盘前映射、updated_at 升 RFC 3339；误解双落点与
   mastery 键维持现状、原样保留（§5.4 单一落点是提案未拍板，不随本条改）；
3. effective_node 读侧归一：旧值展示成三档，next_statuses 不因旧词表缺键而算空；
4. **核心验收**：save_progress 写出的 progress.yaml 过得了**包内 progress 校验器**
   （engine_node.validate_data("progress")）——此前后端从没验过这份文件。
"""
from __future__ import annotations

import re

import pytest

from app import curriculum_store as cs


# ---------- 1. 读侧映射 ----------


def test_normalize_status_maps_legacy_six_tier():
    assert cs.NODE_STATUSES == ["未开始", "学习中", "已学完"]
    assert cs.normalize_status("未开始") == "未开始"
    assert cs.normalize_status("学习中") == "学习中"
    assert cs.normalize_status("已学完") == "已学完"
    # 规格 §5.2 明文的六条映射
    assert cs.normalize_status("初步理解") == "学习中"
    assert cs.normalize_status("能独立应用") == "已学完"
    assert cs.normalize_status("需要复习") == "已学完"
    assert cs.normalize_status("已通过项目验证") == "已学完"
    # 不认识的词退回「未开始」：猜错比显示成没开始坏得多（上游 toTier 同口径）
    assert cs.normalize_status("骗你的状态") == "未开始"
    assert cs.normalize_status(None) == "未开始"
    assert cs.normalize_status(1) == "未开始"


def test_done_statuses_and_transitions_three_tier():
    assert cs.DONE_STATUSES == {"已学完"}
    assert cs.TRANSITIONS == {
        "未开始": ["学习中"],
        "学习中": ["已学完"],
        "已学完": ["学习中"],
    }


# ---------- 2. 写回即收敛 ----------


def test_save_progress_converges_legacy_entries(tmp_path, monkeypatch):
    monkeypatch.setattr(cs, "subject_dir", lambda slug: tmp_path / slug)
    slug = "conv"
    legacy = {
        "updated_at": "2026-09-24",
        "nodes": {
            "a": {"status": "能独立应用", "mastery": 0.85, "notes": "旧工作区"},
            "b": {"status": "初步理解", "mastery": 0.5},
            "c": {"status": "学习中"},
        },
        "misconceptions": [{"topic": "旧双落点"}],
        "project": {"current": "p"},
    }
    cs.save_progress(slug, legacy)
    raw = (tmp_path / slug / "progress.yaml").read_text(encoding="utf-8")

    # 写回即用新词表（规格 §5.2），旧值不再出现在文件里
    assert "能独立应用" not in raw and "初步理解" not in raw
    assert "已学完" in raw and "学习中" in raw
    # updated_at 是带时区的 RFC 3339（包内校验器按 date-time 卡，纯日期阻断）
    assert re.search(r"updated_at: ['\"]\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}['\"]", raw)
    # 误解双落点与 mastery 键维持现状：原样保留，不因写回丢失（§5.4 单一落点未拍板）
    assert "misconceptions" in raw and "旧双落点" in raw
    # mastery 键读侧容忍：原样保留，不因写回丢失
    assert "mastery: 0.85" in raw and "旧工作区" in raw


# ---------- 3. 读侧归一展示 ----------


def test_effective_node_normalizes_legacy_status():
    node = {"id": "n1", "title": "t", "kind": "概念", "objective": "o", "status": "未开始"}
    view = cs.effective_node(node, {"status": "能独立应用"}, 1, cs.TRANSITIONS)
    assert view["status"] == "已学完"
    # 旧词表在 TRANSITIONS 里没有键——归一后流转项照常算得出来
    assert view["next_statuses"] == ["学习中"]
    legacy_view = cs.effective_node(node, {"status": "需要复习"}, 1, cs.TRANSITIONS)
    assert legacy_view["status"] == "已学完"


# ---------- 4. 核心验收：包内 progress 校验器 ----------


def test_saved_progress_passes_package_validator(tmp_path, monkeypatch):
    """save_progress 写出的文件必须过包内 progress 校验器——这是本条改造的核心验收。

    校验器会与 curriculum.yaml 对账（大纲没有的节点按「状态不会被任何一节课读到」拦），
    所以样本连同大纲一起造。输入特意喂旧六档 + 纯日期 updated_at + 误解双落点：
    旧工作区读改写后的产物也要过得了校验（写回即收敛，不只是新文件干净）。
    """
    from app import engine_node

    if not engine_node.available():
        pytest.skip("engine-node 未就绪（node 或 vendor 产物缺失）")

    monkeypatch.setattr(cs, "subject_dir", lambda slug: tmp_path / slug)
    slug = "validator"
    subject = tmp_path / slug
    subject.mkdir(parents=True)
    (subject / "curriculum.yaml").write_text(
        "nodes:\n"
        "  - id: a\n"
        "    title: 甲\n"
        "    objective: o\n"
        "    prerequisites: []\n"
        "    status: 未开始\n"
        "    kind: 概念\n"
        "  - id: b\n"
        "    title: 乙\n"
        "    objective: o\n"
        "    prerequisites: []\n"
        "    status: 未开始\n"
        "    kind: 概念\n"
        "edges: []\n",
        encoding="utf-8",
    )
    cs.save_progress(
        slug,
        {
            "updated_at": "2026-09-24",
            "nodes": {
                "a": {"status": "能独立应用", "mastery": 0.85, "notes": "旧工作区"},
                "b": {"status": "学习中"},
            },
            "misconceptions": [{"topic": "旧双落点"}],
            "project": {"current": "p"},
        },
    )
    file = subject / "progress.yaml"

    report = engine_node.validate_data("progress", file)
    assert report["blocking"] is False, report["problems"]
