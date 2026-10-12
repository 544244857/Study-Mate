"""migrate_yaml 工具：dry-run 不写、apply 归一且备份、数据语义不变。"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest
import yaml

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))
migrate_yaml = importlib.import_module("migrate_yaml")


@pytest.fixture()
def stale_file(tmp_path: Path) -> Path:
    """旧默认 width=80 写出的多行标量文件（内容必须含空格断点，纯中文不折行）。"""
    payload = {"greeting": "多行标量样本 words " * 30, "nodes": {"intro": {"status": "学习中"}}}
    file = tmp_path / "progress.yaml"
    file.write_text(yaml.safe_dump(payload, allow_unicode=True, sort_keys=False), encoding="utf-8")
    assert "\n" in yaml.safe_load(file.read_text(encoding="utf-8"))["greeting"].__str__() or "\n" in file.read_text(encoding="utf-8"), "夹具必须真的产生多行标量"
    return file


def test_analyze_flags_old_width_and_normalizes(stale_file):
    normalized, reason = migrate_yaml.analyze(stale_file)
    assert normalized is not None and reason == ""
    assert "\n" not in yaml.safe_load(normalized)["greeting"], "归一后不再有多行标量"
    # 数据语义不变
    assert yaml.safe_load(normalized) == yaml.safe_load(stale_file.read_text(encoding="utf-8"))


def test_analyze_skips_comments_and_clean_files(tmp_path):
    commented = tmp_path / "commented.yaml"
    commented.write_text("# 手写注释\nkey: value\n", encoding="utf-8")
    normalized, reason = migrate_yaml.analyze(commented)
    assert normalized is None and "注释" in reason

    clean = tmp_path / "clean.yaml"
    payload = {"a": "短值"}
    clean.write_text(yaml.safe_dump(payload, allow_unicode=True, sort_keys=False, width=10**9), encoding="utf-8")
    normalized, reason = migrate_yaml.analyze(clean)
    assert normalized is None and reason == "已归一"


def test_dry_run_writes_nothing(tmp_path, stale_file, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(migrate_yaml, "find_workspace", lambda explicit: tmp_path)
    monkeypatch.setattr(sys, "argv", ["migrate_yaml.py"])
    before = stale_file.read_bytes()
    migrate_yaml.main()
    assert stale_file.read_bytes() == before, "dry-run 不许写任何文件"
    assert "dry-run 结束" in capsys.readouterr().out


def test_apply_migrates_backs_up_keeps_data(tmp_path, stale_file, monkeypatch, capsys):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    file = workspace / "progress.yaml"
    file.write_text(stale_file.read_text(encoding="utf-8"), encoding="utf-8")
    data_before = yaml.safe_load(file.read_text(encoding="utf-8"))

    monkeypatch.setenv("STUDYMATE_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr(migrate_yaml, "find_workspace", lambda explicit: workspace)
    monkeypatch.setattr(sys, "argv", ["migrate_yaml.py", "--apply"])
    migrate_yaml.main()
    out = capsys.readouterr().out

    assert "完成" in out
    migrated = yaml.safe_load(file.read_text(encoding="utf-8"))
    assert migrated == data_before, "归一只改格式，数据语义必须不变"
    assert "\n" not in migrated["greeting"]
    backups = list((tmp_path / "data" / "migrations").rglob("progress.yaml"))
    assert len(backups) == 1, "apply 前必须逐文件备份"
    assert yaml.safe_load(backups[0].read_text(encoding="utf-8")) == data_before
    # 已归一的工作区再跑：无事可做
    monkeypatch.setattr(sys, "argv", ["migrate_yaml.py", "--apply"])
    migrate_yaml.main()
    assert "没有需要迁移" in capsys.readouterr().out
