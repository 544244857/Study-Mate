"""`::: code` 规范摘录内联的回归测试：

1. 产课派工值内联 `::: code` 规范摘录——模型沙箱读不到仓库根规范文档，SKILL.md 里
   「见规范 §4」的指针不能是悬空的（照 build.py 内联包内 schema 的先例）；
2. 摘录读的是**引擎包内**那份（与门禁 sm-validate lesson 执行的 format.ts 同版本），
   仓库根的同步副本不作判定源（AGENTS.md 规矩 3）；
3. 摘不到（engine-node 未 setup、上游改了标题）时回落手写摘要，派工不因缺文件中断。
"""
from __future__ import annotations

from app import produce


def node(kind="概念"):
    return {
        "id": "net.ip",
        "title": "IP 地址、子网与路由",
        "kind": kind,
        "objective": "能算出一个网段的可用地址范围",
    }


def test_content_values_inlines_code_spec_excerpt(tmp_path):
    values = produce.content_values(tmp_path, "computer-networks", node(), 3)
    spec = produce._code_directive_spec()
    assert "`::: code` 怎么写" in values
    assert spec in values
    # 摘的是 §4 那一节：三条报错码都在，且不越界到下一节
    assert spec.startswith("### ")
    for code in ("code-lang", "code-field", "code-body"):
        assert code in spec
    assert "### " not in spec[4:]
    # 摘录里讲清两种写法并存，模型不会把普通围栏也改成指令
    assert "普通围栏" in spec


def test_experiment_values_inlines_code_spec_excerpt(tmp_path):
    values = produce.experiment_values(tmp_path, "computer-networks", node("实验"), 4)
    assert "`::: code` 怎么写" in values
    assert produce._code_directive_spec() in values


def test_code_spec_reads_engine_package_copy():
    """规则单源 = 上游 npm 包：读包内那份，与门禁同版本；仓库根副本即使存在也不用。"""
    from app.config import ENGINE_NODE_DIR, REPO_ROOT, engine_doc_path

    path = engine_doc_path("docs/规范/课件内容格式.md")
    assert path.is_file(), f"引擎包内规范文档不在：{path}（先跑 node setup.mjs）"
    assert ENGINE_NODE_DIR in path.parents, f"摘录应读引擎包内那份：{path}"
    assert path != REPO_ROOT / "docs" / "规范" / "课件内容格式.md", "不读仓库根副本"
    doc = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert produce._code_directive_spec() in doc


def test_code_spec_falls_back_when_doc_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(produce, "engine_doc_path", lambda rel: tmp_path / "missing.md")
    spec = produce._code_directive_spec()
    assert spec == produce._CODE_SPEC_FALLBACK
    for code in ("code-lang", "code-field", "code-body"):
        assert code in spec
    # 派工值仍带规则：缺文件不能把模型留在悬空指针上
    assert spec in produce.content_values(tmp_path, "computer-networks", node(), 3)
