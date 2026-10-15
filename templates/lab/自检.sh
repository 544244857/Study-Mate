#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────
# StudyMate · lab 骨架自检：在干净目录里整套重跑两态
#
# 出题角色交件之前跑一次。它只回事实——两态各在一个**临时目录**里重跑一遍，跑完就删：
#
#   干净态：任务留白、参考解仍在 `solutions/` 里——断言读不到那一格，退出码非零
#   作答态：把 `solutions/<任务>/作答` 拷进任务目录之后再跑**同一个入口**——退出码归零
#
# 判据现场算，不写死数字；两次的退出码就是那两次运行的原话，原样转述。
#
# 用法：sh 自检.sh      （先干净态、后作答态，各一个干净目录）
# 退出码：它**最后一次**跑的那一次的退出码，原样（没有第二套码表）。
# 变量名一律 ASCII：`sh` 认不得中文变量名（打印出来的标签仍是中文）。
# ─────────────────────────────────────────────────────────────────────────
set -u

ROOT=$(dirname "$0")
cd "$ROOT" || exit
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

# 一个状态跑一遍：整棵 lab 拷进临时目录，在那里跑任务目录的 check.sh
run_state() {
  STATE=$1
  TMP=$(mktemp -d) || exit
  cp -R "$ROOT"/. "$TMP"/ || exit
  printf '── %s ──\n' "$STATE"
  printf '临时目录：%s\n' "$TMP"
  if [ "$STATE" = 作答态 ]; then
    printf '拷贝：%s/solutions/%s/作答/. → %s/%s/作答/\n' "$ROOT" "$TASK" "$TMP" "$TASK"
    cp -R "$ROOT/solutions/$TASK/作答/." "$TMP/$TASK/作答/" || exit
  fi
  printf '命令：sh check.sh（cwd %s/%s）\n' "$TMP" "$TASK"
  ( cd "$TMP/$TASK" && sh check.sh )
  CODE=$?
  printf '%s退出码：%d\n' "$STATE" "$CODE"
  rm -rf "$TMP"
  printf '临时目录已删：%s\n' "$TMP"
  return "$CODE"
}

run_state 干净态
run_state 作答态
exit
