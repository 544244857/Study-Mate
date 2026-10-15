#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────
# StudyMate · lab 干净态入口（摆盘 → 调 check.sh → 原样转述事实）
#
# 「干净态」= 任务留白、参考解仍在 `solutions/` 里。**判分入口只有一个，还是 `check.sh`**：
# 本脚本只做三件事，一件都不多：
#   · **摆盘**：整棵 lab 拷进一个**临时目录**，在那里跑（真 lab 一个字节都不动）；
#   · **跑**：`sh check.sh`，输出直接透传（不截、不改、不加工）；
#   · **转述**：临时目录、命令、退出码逐行印成事实，再把 check.sh 那个退出码原样交回去。
# **不判定、不设第二套退出码语义**：非零不是判决，只是「这一次的退出码是多少」这条事实。
#
# 用法：sh 干净态.sh
# 另两个脚本：`sh 作答态.sh`（把参考解的作答摆进临时副本再跑）、`sh 自检.sh`（两态各一遍）
# 变量名一律 ASCII：`sh` 认不得中文变量名（打印出来的标签仍是中文）。
# ─────────────────────────────────────────────────────────────────────────
set -u

SELF=$(dirname "$0")
cd "$SELF" || exit
ROOT=$PWD

# 任务目录 = 骨架里除 solutions/ 之外的第一个目录（照抄后改成 `<NNNN>-<主题>` 也认得）
TASK=
for CAND in "$ROOT"/*/; do
  [ -d "$CAND" ] || continue
  NAME=$(basename "$CAND")
  [ "$NAME" = solutions ] && continue
  TASK=$NAME
  break
done
if [ -z "$TASK" ]; then
  printf '任务目录不在：%s 下没有一个 <NNNN>-<主题> 目录\n' "$ROOT"
  exit
fi

TMP=$(mktemp -d) || exit
cp -R "$ROOT"/. "$TMP"/ || exit
printf '状态：干净态（任务留白、参考解仍在 solutions/ 里）\n'
printf '临时目录：%s\n' "$TMP"
printf '命令：sh check.sh（cwd %s/%s）\n' "$TMP" "$TASK"
( cd "$TMP/$TASK" && sh check.sh )
CODE=$?
printf '干净态退出码：%d\n' "$CODE"
rm -rf "$TMP"
printf '临时目录已删：%s\n' "$TMP"
exit "$CODE"
