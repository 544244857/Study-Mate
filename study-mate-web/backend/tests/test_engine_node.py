"""engine_node 调用层 + 旁路：node CLI 契约在 python 侧的投影。

CLI 本身的退出码 / JSON 形状 / 夹具判定的细粒度断言在 engine-node/tests/ 里测；
这里只验 python 侧包装：超时与错误映射、数据阻断 ≠ CLI 错误。
node 缺席（CI 无 node / vendor 未整形）时全部跳过并打标，不让 CI 假红。
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import engine_node

pytestmark = pytest.mark.skipif(
    not engine_node.available(), reason="engine-node 未就绪（node 或 vendor 产物缺失）"
)

# 夹具形状以包内 schema 为准：curriculum 节点必填 id/title/objective/prerequisites/status/kind；
# 课件 front matter 只有 title/goal（新格式，与 engine-node/tests 同一份最小件）
GOOD_CURRICULUM = (
    "nodes:\n"
    "  - id: intro\n"
    "    title: 测试课\n"
    "    objective: 会做一次最小提交\n"
    "    prerequisites: []\n"
    "    status: 未开始\n"
    "    kind: 概念\n"
    "edges: []\n"
)
GOOD_LESSON = (
    "---\ntitle: 测试课\ngoal: 会做一次最小提交\n---\n\n"
    "## 为什么要版本控制\n\n"
    "文件只有一个当前状态，改坏了想找却找不到。\n\n"
    "::: quiz 理解 锚点：为什么要版本控制\n:::\n"
)
GOOD_POOL = json.dumps(
    {
        "为什么要版本控制": [
            {
                "q": "下面哪个是版本控制解决的问题？",
                "opts": ["文件改坏了找不回旧版本", "文件太大", "打不开文件", "文件名太长"],
                "ans": 0,
                "why": "版本控制保存历史，改坏可回退。",
            }
        ]
    },
    ensure_ascii=False,
)


@pytest.fixture()
def node_subject(tmp_path: Path) -> tuple[Path, Path]:
    """tmp_path 当工作区根，里面一个最小合法科目。返回 (工作区根, 课件路径)。"""
    subject = tmp_path / ".learning" / "subjects" / "demo"
    (subject / "lessons").mkdir(parents=True)
    (subject / "curriculum.yaml").write_text(GOOD_CURRICULUM, encoding="utf-8")
    lesson = subject / "lessons" / "0001-intro.md"
    lesson.write_text(GOOD_LESSON, encoding="utf-8")
    (subject / "lessons" / "0001-intro.quiz.json").write_text(GOOD_POOL, encoding="utf-8")
    return tmp_path, lesson



def test_validate_lesson_good(node_subject):
    _ws, lesson = node_subject
    report = engine_node.validate_lesson(lesson)
    assert report["blocking"] is False
    assert report["blockingCount"] == 0
    assert report["anchors"][0]["resolution"] == "resolved"


def test_validate_lesson_missing_pool_is_blocking_not_error(node_subject):
    _ws, lesson = node_subject
    lesson.with_suffix(".quiz.json").unlink()  # 有 quiz 位置没题库：数据阻断，exit 2 ≠ CLI 错误
    report = engine_node.validate_lesson(lesson)
    assert report["blocking"] is True
    assert any("找不到题库" in p["message"] for p in report["problems"])


def test_validate_lesson_self_error_raises(node_subject):
    _ws, lesson = node_subject
    with pytest.raises(engine_node.EngineNodeError, match="不存在"):
        engine_node.validate_lesson(lesson.with_name("不存在.md"))


def test_validate_data_curriculum(tmp_path):
    subject = tmp_path / "s1"
    subject.mkdir()
    good = subject / "curriculum.yaml"
    good.write_text(GOOD_CURRICULUM, encoding="utf-8")
    assert engine_node.validate_data("curriculum", good)["blocking"] is False

    bad = subject / "bad.yaml"
    bad.write_text("nodes:\n  - id: intro\n    kind: 不存在的课型\n", encoding="utf-8")
    report = engine_node.validate_data("curriculum", bad)
    assert report["blocking"] is True
    assert report["problems"], "阻断报告必须带问题清单"

    with pytest.raises(ValueError):
        engine_node.validate_data("lesson", bad)  # kind 走 validate_lesson，不是这里


def test_export_workspace_minimal(node_subject, tmp_path):
    ws, _lesson = node_subject
    out = tmp_path / "out"
    result = engine_node.export_workspace(ws, out, subjects=["demo"])
    assert result["ok"] is True
    assert Path(result["entry"]).is_file()
    assert result["subjects"][0]["slug"] == "demo"


def test_export_not_a_workspace_raises_with_upstream_code(tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(engine_node.EngineNodeError, match="EXPORT_NO_WORKSPACE"):
        engine_node.export_workspace(empty, tmp_path / "out")


def test_discover_workspace_env(monkeypatch, tmp_path):
    monkeypatch.setenv("STUDYMATE_WORKSPACE", str(tmp_path))
    assert engine_node.discover_workspace() == tmp_path
    monkeypatch.delenv("STUDYMATE_WORKSPACE")
    monkeypatch.setenv("STUDYMATE_CONFIG", str(tmp_path / "不存在.yaml"))
    monkeypatch.setenv("DSH_HOME", str(tmp_path / "无配置"))
    assert engine_node.discover_workspace() is None



