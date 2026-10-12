"""金样：引擎判定回归锚。

防止上游规则静默变动：curriculum / lesson 的判定、最小导出、双模式全链
（fixture 派工同内容同结论）都在这里钉住；上游包升版先跑本文件。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from app import curriculum_store as cs, engine_node, yaml_hygiene
from app.config import DATA_DIR

pytestmark = pytest.mark.skipif(
    not engine_node.available(), reason="engine-node 未就绪（node 或 vendor 产物缺失）"
)

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
BAD_KIND_CURRICULUM = GOOD_CURRICULUM.replace("kind: 概念", "kind: 骗你的课型")



def test_golden_curriculum_good_passes(tmp_path):
    import yaml

    data = yaml.safe_load(GOOD_CURRICULUM)
    assert cs.validate_curriculum(data) == [], "进程内 schema 校验应放行"
    file = tmp_path / "good.yaml"
    file.write_text(GOOD_CURRICULUM, encoding="utf-8")
    assert engine_node.validate_data("curriculum", file)["blocking"] is False


def test_golden_curriculum_bad_kind_blocked_by_both(tmp_path):
    import yaml

    data = yaml.safe_load(BAD_KIND_CURRICULUM)
    assert cs.validate_curriculum(data) != [], "进程内 schema 校验应拦截"
    file = tmp_path / "bad.yaml"
    file.write_text(BAD_KIND_CURRICULUM, encoding="utf-8")
    node_report = engine_node.validate_data("curriculum", file)
    assert node_report["blocking"] is True
    # 两边拦截的是同一件事：kind 不在枚举里
    assert any("kind" in p["message"] for p in node_report["problems"]), node_report["problems"]


def test_golden_lesson_minimal_export_ok(tmp_path):
    """最小合法科目：node 校验放行 + 导出成功，产物自包含。"""
    subject = tmp_path / ".learning" / "subjects" / "demo"
    (subject / "lessons").mkdir(parents=True)
    (subject / "curriculum.yaml").write_text(GOOD_CURRICULUM, encoding="utf-8")
    lesson = subject / "lessons" / "0001-intro.md"
    lesson.write_text(
        "---\ntitle: 测试课\ngoal: 会做一次最小提交\n---\n\n"
        "## 为什么要版本控制\n\n正文。\n",
        encoding="utf-8",
    )
    report = engine_node.validate_lesson(lesson)
    assert report["blocking"] is False
    result = engine_node.export_workspace(tmp_path, tmp_path / "out", subjects=["demo"])
    assert result["ok"] is True
    assert (tmp_path / "out" / "index.html").is_file()


def test_golden_lesson_code_directive_round_trip(tmp_path):
    """`::: code` 框内解释槽（上游 #116）：合法写法放行，字段写错按 code-lang 带行号阻断。

    产课派工值内联了规范 §4 的 `::: code` 摘录（test_code_directive_values.py），
    这里钉住摘录教的写法确实过得了门禁、教避开的写法确实被拦——否则提示词与门禁打架。
    """
    subject = tmp_path / ".learning" / "subjects" / "demo"
    (subject / "lessons").mkdir(parents=True)
    (subject / "curriculum.yaml").write_text(GOOD_CURRICULUM, encoding="utf-8")

    good = subject / "lessons" / "0001-intro.md"
    good.write_text(
        "---\ntitle: 测试课\ngoal: 会做一次最小提交\n---\n\n"
        "## 跑一遍看看\n\n"
        "::: code term\n"
        "caption: 第一行是命令，后面两行是它的输出\n\n"
        "> node -e \"console.log(1 + 1)\"\n"
        "2\n"
        ":::\n",
        encoding="utf-8",
    )
    report = engine_node.validate_lesson(good)
    assert report["blocking"] is False, report["problems"]

    bad = subject / "lessons" / "0002-bad.md"
    bad.write_text(
        "---\ntitle: 测试课\ngoal: 会做一次最小提交\n---\n\n"
        "## 字段写在了指令头\n\n"
        "::: code term caption: 写在头里算语言标签\n\n"
        "> echo hi\n"
        "hi\n"
        ":::\n",
        encoding="utf-8",
    )
    bad_report = engine_node.validate_lesson(bad)
    assert bad_report["blocking"] is True
    # CLI 报的是人话（不带 code 字段），按 code-lang 那条的措辞认：字段要写在块里的单独两行
    assert any("语言标签" in p["message"] for p in bad_report["problems"]), bad_report["problems"]

    result = engine_node.export_workspace(tmp_path, tmp_path / "out", subjects=["demo"])
    assert result["ok"] is True
    exported = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in (tmp_path / "out").rglob("*")
        if path.is_file()
    )
    assert "第一行是命令，后面两行是它的输出" in exported, "caption 应随课件进导出产物"


def test_golden_yaml_with_newline_round_trips_through_node(tmp_path):
    """坑③第二形态：值含真实换行时必须以单行双引号转义落盘，上游解析器只认这个。"""
    import yaml as pyyaml

    from app.yaml_out import dump_yaml

    subject = tmp_path / "s1"
    subject.mkdir()
    (subject / "curriculum.yaml").write_text(GOOD_CURRICULUM, encoding="utf-8")
    progress = {
        "updated_at": "2026-10-10T00:00:00Z",
        "nodes": {"intro": {"status": "学习中", "notes": "第一行\n\n第二行（含换行）"}},
        "project": {"current": ""},
    }
    # progress 与 curriculum 同目录（引用完整性按兄弟文件对账）
    file = subject / "progress.yaml"
    file.write_text(dump_yaml(progress), encoding="utf-8")
    text = file.read_text(encoding="utf-8")
    assert '"第一行\\n\\n第二行（含换行）"' in text, "换行必须转义进单行双引号标量"
    assert pyyaml.safe_load(text) == progress, "pyyaml 读回必须无损"
    report = engine_node.validate_data("progress", file)
    assert report["blocking"] is False, report.get("problems")


def test_golden_yaml_hygiene_detects_old_width(tmp_path):
    """卫生探测：旧默认 width 写出的多行标量被点名，归一后的不被点名。"""
    import yaml

    # 内容须含空格断点，pyyaml 才会在默认 width=80 处折成多行标量
    payload = {"greeting": "多行标量样本 words " * 30}
    old = yaml.safe_dump(payload, allow_unicode=True, sort_keys=False)  # 默认 width=80 → 多行标量
    assert "\n" in old.strip() and old.strip().count("\n") >= 1 and "words" in old
    stale_file = tmp_path / "stale.yaml"
    stale_file.write_text(old, encoding="utf-8")
    clean_file = tmp_path / "clean.yaml"
    clean_file.write_text(
        yaml.safe_dump(payload, allow_unicode=True, sort_keys=False, width=10**9), encoding="utf-8"
    )
    result = yaml_hygiene.scan_workspace(tmp_path)
    assert result["needs_migration"] == 1
    assert result["checked"] == 2
    assert str(stale_file) in result["sample"]


# ---------- 双模式全链（fixture 派工，同一内容两边同一结论） ----------


@pytest.fixture()
def produce_subject(client, new_subject):
    """带 fixture 大纲（demo.intro/core/lab 三节点）的科目，供产课链用。"""
    from app.llm import FIXTURE_CURRICULUM

    slug, base = new_subject
    r = client.put(f"/api/courses/{slug}/curriculum", json=FIXTURE_CURRICULUM)
    assert r.status_code == 200, r.text
    return slug, base


def _sse_events(r) -> list[tuple[str, dict]]:
    import json as _json

    out: list[tuple[str, dict]] = []
    current = None
    for line in r.text.splitlines():
        if line.startswith("event: "):
            current = line[7:]
        elif line.startswith("data: ") and current is not None:
            out.append((current, _json.loads(line[6:])))
            current = None
    return out


def test_golden_produce_chain_node_mode(client, monkeypatch, produce_subject):
    """node 模式产课全链：上游校验器当门禁、无渲染步骤、md+quiz 落盘、同结论放行。"""
    from app import tickets as tickets_svc

    monkeypatch.setenv("STUDYMATE_ENGINE", "node")
    slug, base = produce_subject
    r = client.post(f"/api/courses/{slug}/nodes/demo.intro/produce", json={})
    assert r.status_code == 200, r.text
    stages = {e["stage"]: e["status"] for name, e in _sse_events(r) if name == "stage"}
    assert stages.get("检查") == "done", stages
    assert "渲染" not in stages, "node 模式没有独立渲染步骤"
    assert (base / "lessons" / "0001-demo.intro.md").is_file()
    assert (base / "lessons" / "0001-demo.intro.quiz.json").is_file()
    assert not (base / "lessons" / "0001-demo.intro.html").exists(), "node 模式不渲染单课 html"
    assert not tickets_svc.list_tickets(slug=slug, open_only=True)


def test_golden_produce_chain_node_mode_blocks_bad_quiz(client, monkeypatch, produce_subject):
    """node 模式下锚点没题 = 阻断 → 与 python 检查器同结论（同题同错），进打回轮后耗尽。"""
    from app import produce as produce_mod

    original_quiz = produce_mod.fixture_quiz_envelope

    def bad_quiz(values: str) -> dict:
        envelope = original_quiz(values)
        for item in envelope.get("files", []):
            if str(item.get("path", "")).endswith(".quiz.json"):
                item["content"] = '{"没人引用的锚点": [{"q":"x","opts":["a","b"],"ans":0,"why":"w"}]}'
        return envelope

    monkeypatch.setenv("STUDYMATE_ENGINE", "node")
    monkeypatch.setattr(produce_mod, "fixture_quiz_envelope", bad_quiz)
    slug, _base = produce_subject
    r = client.post(f"/api/courses/{slug}/nodes/demo.intro/produce", json={})
    names = [name for name, _ in _sse_events(r)]
    assert "retry" in names, f"应进打回轮：{names}"
    assert "done" not in names


def test_golden_build_gate_node_mode(client, monkeypatch, new_subject):
    """node 模式建课门禁：fixture 大纲（已去 mastery）经上游 schema 校验放行并落盘。"""
    from app.llm import FIXTURE_CURRICULUM

    monkeypatch.setenv("STUDYMATE_ENGINE", "node")
    slug, base = new_subject
    r = client.put(f"/api/courses/{slug}/curriculum", json=FIXTURE_CURRICULUM)
    assert r.status_code == 200, r.text
    assert (base / "curriculum.yaml").is_file()


def test_golden_export_and_reading_node_mode(client, monkeypatch, produce_subject):
    """node 模式导出/reading：sm-export 产物落 exports、二次命中缓存、StaticFiles 可读。"""
    from app import exporter

    monkeypatch.setenv("STUDYMATE_ENGINE", "node")
    slug, _base = produce_subject
    first = client.get(f"/api/courses/{slug}/reading").json()
    assert first["engine"] == "node" and first["fresh"] is False
    assert (DATA_DIR / "exports" / slug / "index.html").is_file()
    second = client.get(f"/api/courses/{slug}/reading").json()
    assert second["fresh"] is True
    forced = client.post(f"/api/courses/{slug}/export")
    assert forced.status_code == 200, forced.text
    assert forced.json()["engine"] == "node"
    served = client.get(f"/api/exports/{slug}/index.html")
    assert served.status_code == 200 and "text/html" in served.headers["content-type"]
