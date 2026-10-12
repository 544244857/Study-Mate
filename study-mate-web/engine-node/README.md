# engine-node —— 上游引擎包的消费层

Web 运行时的渲染 / 校验 / 工作区发现**不再用冻结 Python 副本**，改从上游发布物
`@yunmiao/studymate` 消费：规则零分叉，同步通道 = npm 版本 + 我们的契约测试。
方案的完整依据与上游包装坑见 `docs/StudyMate-Web_引擎复用与回流.md`。

## 结构

- `package.json` —— 钉上游包版本与 React 版本（上游发布包不声明 react 依赖，消费方自装）
- `setup.mjs` —— 安装 + 整形（幂等）：npm ci → 把包拷出 `node_modules` 成 `vendor/studymate`
  （node 拒绝 type-strip node_modules 里的 `.ts`）→ 把 React 三件套落进 vendor 自己的
  node_modules、scheduler 补到 `react-dom/node_modules/` 嵌套（上游导出只认这个布局）→ 自检
- `sm-export.mjs` / `sm-validate.mjs` / `sm-workspace.mjs` —— 三个 CLI（契约见下）
- `sm-lib.mjs` —— CLI 共用件（参数解析 / vendor 定位 / 报错出口）
- `tests/` —— CLI 契约测试（`node --test "tests/*.test.mjs"`；夹具形状以包内 schema 为准）
- `vendor/`、`node_modules/` —— gitignore，setup 产物

## CLI 契约（后端只依赖契约，不依赖包内部结构）

| CLI | 用法 | stdout | 退出码 |
|---|---|---|---|
| `sm-export.mjs` | `--workspace W [--subject S]… --out O [--json] [--quiet]` | `--json` 时一行 `{ok, out, entry, files[], count, bytes, subjects[], react, summary}` | 0 成功；1 失败（stderr 带上游错误码）；130 中断 |
| `sm-validate.mjs` | `lesson <file.md> [--subject 科目目录]` / `curriculum\|progress\|subject <file.yaml>` | 一行报告 `{file, blocking, blockingCount, problems[{file,line,message,blocking}], summary}`（lesson 另附 anchors/orphans） | 0 放行；2 有阻断（problems 即打回依据）；1 自身错误 |
| `sm-workspace.mjs` | `[--workspace 显式]` | 一行工作区绝对路径 | 0 解析到；1 解析不到 |

查找顺序与冻结 Python `gen_home.py::learn_workspace()` 对齐：
`--workspace` → `$STUDYMATE_WORKSPACE` → `$LEARN_WORKSPACE` → `$STUDYMATE_CONFIG`/`$DSH_HOME/studymate-config.yaml` 的 `workspace` 字段。
schema 用包内 `schemas/*.json`（随包发货）——校验规则的单源就是上游包本身。

## 使用与升版

```bash
node setup.mjs              # 装依赖 + 整形 + 自检（CI / 启动器各跑一次）
npm test                    # 契约测试 18 例
```

升上游版本：改 `package.json` 的 `@yunmiao/studymate` → `node setup.mjs` → `npm test`
→ 全量后端 pytest → E2E 冒烟；任何一步红 = 不上（金样测试见后端 `tests/test_engine_golden.py`）。
