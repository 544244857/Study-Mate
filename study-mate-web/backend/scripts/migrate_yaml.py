"""工作区 YAML 卫生迁移：把旧 pyyaml 默认 width=80 写出的多行标量全量归一。

为什么需要：上游 TS 解析器不认多行标量（见 docs/StudyMate-Web_引擎复用与回流.md §3）——
旧后端默认 width=80 折出的多行 plain/单引号标量，以及**值本身含真实换行**时
pyyaml 必然写出的跨行引号标量，都会让导出整份工作区直接失败。后端写侧已统一走
`app/yaml_out.dump_yaml` 止血（width=10**9 + 换行值双引号转义），本工具做一次性存量迁移：

    python scripts/migrate_yaml.py                # dry-run：只报清单，不写任何文件
    python scripts/migrate_yaml.py --apply        # 执行：先备份到 data/migrations/<ts>/，再原子写回
    python scripts/migrate_yaml.py --workspace P  # 显式指定工作区（缺省按发现规则解析）

做法：pyyaml round-trip（`safe_load` → `app/yaml_out.dump_yaml`，与写侧同参）。
数据语义不变（load→dump 是纯格式归一）；
**文本没变化的文件不动**，含独立注释行的文件跳过并点名（可能手改过，留人审）。
写回前逐文件备份到 `data/migrations/<时间戳>/`，镜像相对路径。
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import time
from pathlib import Path

import yaml

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "app"))

from yaml_out import dump_yaml  # noqa: E402  与 app 写侧同参（含换行的值 → 单行双引号转义）

# 单文件扫描上限保护：学习工作区 yaml 都是几百行内的小文件，超过按异常处理
MAX_FILE_BYTES = 4 * 1024 * 1024


def find_workspace(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    for name in ("STUDYMATE_WORKSPACE", "LEARN_WORKSPACE"):
        value = os.getenv(name, "").strip()
        if value:
            return Path(value).expanduser().resolve()
    cfg = os.getenv("STUDYMATE_CONFIG", "").strip() or str(
        Path(os.getenv("DSH_HOME") or Path.home() / ".dsh").expanduser() / "studymate-config.yaml"
    )
    try:
        loaded = yaml.safe_load(Path(cfg).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, yaml.YAMLError):
        loaded = None
    workspace = loaded.get("workspace") if isinstance(loaded, dict) else None
    if isinstance(workspace, str) and workspace.strip():
        return Path(workspace.strip()).expanduser().resolve()
    print(f"error: 解析不到工作区（配置 {cfg} 无 workspace 字段），用 --workspace 显式指定", file=sys.stderr)
    raise SystemExit(2)


def has_standalone_comment(text: str) -> bool:
    """有没有独立注释行（行首 #）。行内 # 可能是内容，不算——这类文件不值得误伤。"""
    return any(line.lstrip().startswith("#") for line in text.splitlines())


def analyze(path: Path) -> tuple[str | None, str]:
    """返回 (归一后的文本 | None=不该动, 原文)。None 的原因见输出清单里的 reason。"""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        return None, f"读不了（{exc}）"
    if len(text.encode("utf-8")) > MAX_FILE_BYTES:
        return None, "超大小保护上限，跳过"
    if has_standalone_comment(text):
        return None, "含注释行，跳过（可能手改过，留人审）"
    try:
        data = yaml.safe_load(text)
        normalized = dump_yaml(data) if data is not None else text
    except yaml.YAMLError as exc:
        return None, f"yaml 解不开（{type(exc).__name__}），跳过——这不是本工具的事"
    if normalized == text:
        return None, "已归一"
    try:
        yaml.safe_load(normalized)
    except yaml.YAMLError:  # pragma: no cover - 归一产物必须可读，读不了说明工具 bug
        return None, "归一产物自身解析失败，跳过（请报告）"
    return normalized, ""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--workspace", help="工作区路径（缺省按 STUDYMATE_WORKSPACE / 配置解析）")
    parser.add_argument("--apply", action="store_true", help="执行写回（缺省 dry-run 只报清单）")
    args = parser.parse_args()

    workspace = find_workspace(args.workspace)
    if not workspace.is_dir():
        print(f"error: 工作区不存在：{workspace}", file=sys.stderr)
        raise SystemExit(2)
    files = sorted(workspace.rglob("*.yaml")) + sorted(workspace.rglob("*.yml"))
    print(f"工作区：{workspace}（扫描 {len(files)} 份 yaml）")

    pending: list[tuple[Path, str]] = []
    skipped: list[tuple[Path, str]] = []
    for path in files:
        normalized, reason = analyze(path)
        if normalized is None:
            if reason != "已归一":
                skipped.append((path, reason))
            continue
        pending.append((path, normalized))

    for path, reason in skipped:
        print(f"  跳过 {path.relative_to(workspace)}：{reason}")
    if not pending:
        print("结论：没有需要迁移的文件。")
        return
    print(f"将重写 {len(pending)} 份（round-trip 归一，数据语义不变）：")
    for path, normalized in pending:
        before = len(path.read_text(encoding="utf-8").splitlines())
        after = len(normalized.splitlines())
        print(f"  {path.relative_to(workspace)}（{before} 行 → {after} 行）")

    if not args.apply:
        print("dry-run 结束：未写任何文件。确认清单后加 --apply 执行。")
        return

    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup_root = Path(os.getenv("STUDYMATE_DATA_DIR") or (BACKEND.parent / "data")) / "migrations" / stamp
    for path, normalized in pending:
        backup = backup_root / path.relative_to(workspace)
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup)
        tmp = path.with_name(f".{path.name}.migrate-{os.getpid()}.tmp")
        tmp.write_text(normalized, encoding="utf-8")
        os.replace(tmp, path)
    print(f"完成：{len(pending)} 份已归一；原件备份在 {backup_root}")


if __name__ == "__main__":
    main()
