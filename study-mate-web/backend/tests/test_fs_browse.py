"""目录枚举端点 GET /api/fs/dirs：根枚举、一级子目录过滤、错误与截断。"""
from __future__ import annotations

import os

from app.routers import fs_browse


def test_roots(client):
    """无 path：Windows 列出存在的盘根（至少 C:\\），非 Windows 只有根。"""
    data = client.get("/api/fs/dirs").json()
    assert data["truncated"] is False
    if os.name == "nt":
        assert "C:\\" in data["dirs"]
    else:
        assert data["dirs"] == ["/"]


def test_lists_only_subdirs_as_absolute(client, tmp_path):
    """只返回一级子目录（排除文件、. 隐藏目录），且为绝对路径。"""
    root = tmp_path / "browse"
    root.mkdir()
    (root / "子目录A").mkdir()
    (root / "普通文件.txt").write_text("x", encoding="utf-8")
    (root / ".隐藏目录").mkdir()

    data = client.get("/api/fs/dirs", params={"path": str(root)}).json()
    assert data["path"] == str(root)
    assert data["dirs"] == [str(root / "子目录A")]
    assert data["truncated"] is False


def test_missing_path_404(client, tmp_path):
    response = client.get("/api/fs/dirs", params={"path": str(tmp_path / "nowhere")})
    assert response.status_code == 404


def test_file_path_404(client, tmp_path):
    a_file = tmp_path / "a.txt"
    a_file.write_text("x", encoding="utf-8")
    response = client.get("/api/fs/dirs", params={"path": str(a_file)})
    assert response.status_code == 404


def test_relative_path_400(client):
    response = client.get("/api/fs/dirs", params={"path": "relative/dir"})
    assert response.status_code == 400


def test_truncated_when_over_max(client, tmp_path, monkeypatch):
    root = tmp_path / "many"
    root.mkdir()
    for index in range(5):
        (root / f"d{index}").mkdir()

    monkeypatch.setattr(fs_browse, "MAX_DIRS", 2)
    data = client.get("/api/fs/dirs", params={"path": str(root)}).json()
    assert data["truncated"] is True
    assert len(data["dirs"]) == 2
