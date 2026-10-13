"""批量删除会话 POST /api/sessions/bulk-delete：按工作区匹配、附件清理、路径归一与校验。"""
from __future__ import annotations

import sys

import pytest

from app import storage
from app.config import UPLOADS_DIR


def _make_session(workspace):
    return storage.create_session(title="批量删除用例", workspace=workspace)


def test_bulk_delete_matches_same_workspace(client):
    a1 = _make_session(r"D:\a\proj")
    a2 = _make_session(r"D:\a\proj")
    other = _make_session(r"D:\b\proj")
    plain = _make_session(None)

    for session in (a1, a2, other, plain):
        (UPLOADS_DIR / session["id"]).mkdir(parents=True, exist_ok=True)

    response = client.post("/api/sessions/bulk-delete", json={"workspace": r"D:\a\proj"})
    assert response.status_code == 200
    assert response.json() == {"ok": True, "deleted": 2}

    remaining = {meta["id"] for meta in client.get("/api/sessions").json()}
    assert a1["id"] not in remaining
    assert a2["id"] not in remaining
    assert other["id"] in remaining
    assert plain["id"] in remaining

    # 被删会话的 uploads 附件目录连带清掉，未删会话的保留
    assert not (UPLOADS_DIR / a1["id"]).exists()
    assert not (UPLOADS_DIR / a2["id"]).exists()
    assert (UPLOADS_DIR / other["id"]).is_dir()
    assert (UPLOADS_DIR / plain["id"]).is_dir()

    # 再删一次：已无匹配会话
    again = client.post("/api/sessions/bulk-delete", json={"workspace": r"D:\a\proj"})
    assert again.json() == {"ok": True, "deleted": 0}


def test_bulk_delete_ignores_empty_workspace(client):
    """无 workspace 的会话绝不涉及。"""
    plain = _make_session(None)
    response = client.post("/api/sessions/bulk-delete", json={"workspace": r"D:\nope\nowhere"})
    assert response.json()["deleted"] == 0
    assert plain["id"] in {meta["id"] for meta in client.get("/api/sessions").json()}


@pytest.mark.skipif(sys.platform != "win32", reason="Windows 大小写不敏感")
def test_bulk_delete_case_insensitive(client):
    created = _make_session(r"D:\a\proj")
    response = client.post("/api/sessions/bulk-delete", json={"workspace": r"d:\A\PROJ"})
    assert response.json() == {"ok": True, "deleted": 1}
    assert created["id"] not in {meta["id"] for meta in client.get("/api/sessions").json()}


def test_bulk_delete_tilde_equals_expanded(client, tmp_path, monkeypatch):
    """~ 形态与展开形态指向同一目录。"""
    home = tmp_path / "fake-home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))

    created = _make_session(str(home / "proj"))
    response = client.post("/api/sessions/bulk-delete", json={"workspace": "~/proj"})
    assert response.json() == {"ok": True, "deleted": 1}
    assert created["id"] not in {meta["id"] for meta in client.get("/api/sessions").json()}


def test_bulk_delete_empty_or_missing_workspace_422(client):
    assert client.post("/api/sessions/bulk-delete", json={"workspace": "   "}).status_code == 422
    assert client.post("/api/sessions/bulk-delete", json={}).status_code == 422


def test_bulk_delete_relative_workspace_400(client):
    assert (
        client.post("/api/sessions/bulk-delete", json={"workspace": "rel/proj"}).status_code == 400
    )


def test_bulk_delete_leaves_subject_dirs(client, new_subject):
    """课程（科目）是另一套存储：批量删会话不碰科目目录。"""
    _slug, subject_dir = new_subject
    _make_session(r"D:\subject-case\proj")

    response = client.post("/api/sessions/bulk-delete", json={"workspace": r"D:\subject-case\proj"})
    assert response.json()["deleted"] == 1
    assert subject_dir.is_dir()
