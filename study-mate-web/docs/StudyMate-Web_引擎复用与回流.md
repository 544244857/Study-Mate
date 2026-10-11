# StudyMate Web · 引擎复用与回流

> 性质：**专题文档（长青）**。记录 StudyMate Web 作为 ADR-0013「自带引擎的第二形态」，如何消费
> 上游发布物 `@yunmiao/studymate` 做到**引擎规则零分叉**，以及子项目合回上游 `main`（下称**回流**）
> 的条件、手法与剩余项。
> 历史轨迹、逐批验证数据与会话决策见 [Web_CHANGE.md](../Web_CHANGE.md)（只追加）；
> 引擎升版守门见 [engine-node/README.md](../engine-node/README.md)。

## 1. 背景与结论

上游把 `study-mate-web/` 移出 `main`、另存分支 `web/0.7.0-beta`（ADR-0013），并整体退役 Python
引擎。ADR-0013 允许引擎实现各写一份（回流条件②），于是 Web 的引擎形态经历两代：

1. **冻结 Python 副本**：`engine/scripts/` 收 5 入口 + 6 helper、`engine/templates/` 收 3 模板 +
   assets，全部逐字节拷贝。保证当前分支自洽可跑，但每次上游改引擎都得人工追。
2. **上游 npm 包消费层**（现行，`engine-node/`）：渲染 / 质检 / 主页生成 / 大纲校验全部调用
   发布物 `@yunmiao/studymate` 的**核心纯函数**，规则零分叉。

**现行结论**：**同步通道 = npm 版本钉死 + 我们自己的金样测试**，既不依赖上游作者同步，也不受其
引擎改造节奏牵连。冻结 Python 缩到只剩 `engine/scripts/check_pool.py`（图片库对账）。

## 2. 终局架构

```
后端 (FastAPI) ──子进程 + 一行 JSON──► engine-node/（node 消费层）
                                       sm-export.mjs     导出（渲染 + 主页 + 阅读端 SPA）
                                       sm-validate.mjs   校验（课件 / 大纲 / 进度 / 科目）
                                       sm-workspace.mjs  工作区发现
                                       vendor/@yunmiao/studymate（setup 整形产物）
规则全部来自上游包；Web 只做 IO 编排与退出码 / JSON 契约
```

- **唯一调用入口**：后端 `app/engine_node.py` 负责找 node 可执行、起子进程（export 60s /
  validate 15s 超时）、解析 stdout JSON、映射错误；node 未就绪时明确报错指引 `node setup.mjs`，
  **不静默降级**。
- **setup.mjs（幂等）**：`npm ci` → 把包**拷出 `node_modules`** 成 `vendor/studymate` → React 三件套
  落进 vendor 自己的 `node_modules`、`scheduler` 补到 `react-dom/node_modules/` 嵌套 → 自检模块导出面。
  CI（`.github/workflows/web-ci.yml`）与启动器各跑一次。
- **校验为何也能上游化**：`lib/tools/validate.ts` 的四个校验器核心是 `lib/core/` 纯函数
  （`parseLesson` / `validateCurriculum` / `validateProgress` / `validateSubject`），包被拷出
  `node_modules` 后按**文件路径** import 即可（只有工具壳才需要 DSH 的 `DomainAccess`）。

### CLI 契约（后端只依赖契约，不依赖包内部结构）

| CLI | 用法 | stdout | 退出码 |
|---|---|---|---|
| `sm-export.mjs` | `--workspace W [--subject S]… --out O [--json]` | 一行 `{ok,out,entry,files[],count,bytes,subjects[],react,summary}` | 0 成功；1 失败（stderr 带上游错误码如 `EXPORT_NO_WORKSPACE`）；130 中断 |
| `sm-validate.mjs` | `lesson <file.md> [--subject 科目目录]` 或 `curriculum` / `progress` / `subject` `<file.yaml>` | 一行 `{file,blocking,blockingCount,problems[{file,line,message,blocking}],summary}`（lesson 另附 `anchors` / `orphans`） | 0 放行；**2 有阻断**（`problems` 即打回依据）；1 自身错误 |
| `sm-workspace.mjs` | `[--workspace 显式]` | 一行工作区绝对路径 | 0 解析到；1 解析不到 |

工作区发现优先级与冻结期 `gen_home.py::learn_workspace()` 逐字对齐：`--workspace` →
`$STUDYMATE_WORKSPACE` → `$LEARN_WORKSPACE` → `$STUDYMATE_CONFIG` / `$DSH_HOME/studymate-config.yaml`
的 `workspace` 字段。校验一律用**包内** `schemas/*.json`——规则单源就是上游包本身。

### 后端与前端接线

- **产课链**：无独立渲染步骤——`produce.render_and_check` 直接 `sm-validate lesson`，阻断问题按
  归属表进打回轮（文案口径与旧 Python 检查器一致）。
- **建课链**：大纲门禁 `build.run_curriculum_gate` → `sm-validate curriculum`（临时大纲落盘后交给
  上游校验器）；`routers/generate.py` 统一复用该门禁，不自造解析。
- **统一导出层** `app/exporter.py`：`export_subject(slug, force)` 按需导出 + 新鲜度判定（源科目目录
  mtime vs 产物 `.stamp`）+ 暂存目录原子替换，产物统一落 `data/exports/<slug>/`；强制重导端点与
  `GET /api/courses/{slug}/reading` 都走它；`main.py` 挂 `StaticFiles(/api/exports, html=True)` 伺服产物。
- **前端**：`LessonView` iframe src = reading 路由返回的 `/api/exports/<slug>/index.html`；
  `HomeEmbed` 嵌 `/api/exports/_home/index.html`（`/api/home` 即全工作区导出入口）；课件清单列 `*.md`
  源文件，`production_task.lesson_link` 产入口径放宽为 `.md`。

## 3. 数据卫生：多行标量

上游 TS 解析器**只支持单行双引号 `\n` 转义**，不认块标量（`|` / `>`），也不认 pyyaml 默认写出的
跨行引号标量。pyyaml 默认 `width=80` 会把长字符串折行——这是**坑③**，有两个形态：

1. 长字符串被折成跨行引号标量（`width` 拉大即可全单行化）；
2. 值**本身含真实换行**时，pyyaml 无论 `width` 都写出跨行引号标量（`width` 止不住）。

- **止血**：`app/yaml_out.dump_yaml` 是**唯一 YAML 写出层**——`width=10**9` + `allow_unicode` +
  `sort_keys=False`，并对含 `\n` 的值强制 `style='"'`（SafeDumper representer 全进程生效）。
  所有 YAML 写出点（`curriculum_store` / `build` / `generate` / `draft` / `misconceptions` / `records`）
  一律走它。
- **存量迁移**：`backend/scripts/migrate_yaml.py`——遍历工作区 `.yaml`，pyyaml round-trip 归一后写回；
  默认 dry-run，`--apply` 先逐文件备份到 `data/migrations/<时间戳>/` 再原子写；含独立注释行的文件
  **跳过并点名**，留人审。
- **排障信号**：`GET /api/health` 的 `yaml_hygiene` 字段采样（≤50 份、60s 缓存）扫多行标量，
  **只报不迁**（学习数据不擅自动）。

## 4. 上游包装坑与能力取舍

### 三个包装坑（都有确定解法，已固化在 setup.mjs）

1. **node 拒绝 type-strip `node_modules` 里的 `.ts`**：发布包 `lib/` 是 `.ts` 源码，直接在
   `node_modules` 里跑报 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`。解法：装完把包**拷出
   `node_modules`**。
2. **React 解析只认 pnpm 嵌套布局**：导出找 `react-dom/node_modules/scheduler`（pnpm 才有），
   npm 平铺会把 `scheduler` 提到顶层而报 `EXPORT_REACT_MISSING`。解法：setup 补一层嵌套拷贝；
   React 版本由消费方自装在 `engine-node/package.json`（上游发布包不声明 react 依赖）。
3. **多行 yaml 标量被新解析器拒绝**：见 §3，需一次存量迁移 + 写出层止血。

> 前两坑是上游**发布形态**问题，值得反馈上游——PR #43 评论是现成通道。

### 两个能力取舍

1. **导出应用无 URL 路由（无深链）**：导出 SPA 的 `view` / `slug` / `nodeId` 是 React 内部 state，
   无 hash / pushState。**决定接受「应用内导航」**：图谱点节点进的是我们的节点详情页（元数据 +
   「打开阅读端」），不深链到单课——损失最小、零维护。
2. **导出不是硬门禁**：实测未知围栏 / 错锚点 / 锚点指向不存在的题，导出**全部 exit 0**——对账结果
   是**数据**（`nodes` 的 orphans 等字段）而非失败。故门禁不用导出判定，而是调 `sm-validate`
   （`parseLesson` 格式 + 锚点四态对账 + 图片存在性，加三份 YAML 校验器）。

## 5. 根资源引用现状（回流对照）

上游移出主线后曾逐项核对 Web 对仓库根资源的引用与上游新 `main` 的差距。2026-10-11 按
「旧根工具链还受得了的范围」对齐了一部分，现状如下：

| 根资源 | 上游现状 | Web 现状 |
|---|---|---|
| `scripts/{render_lesson,check_lesson,gen_home,check_curriculum}.py` | 已删 | **退役**：渲染 / 主页 / 课件与大纲门禁全部走 `engine-node/`（上游 npm 包） |
| `scripts/check_pool.py` | 已删 | **内建冻结** `engine/scripts/check_pool.py`（`image_scout` 唯一调用方，子进程） |
| 技能规格 | 迁 `preset/skills/`，12 个技能 | **已同步**：`preset/` ← 上游 `main`；`config._skills_dir()` 只认 `preset/skills`（含上游新增的 `curriculum-designer`），`.dsh/skills` 回落分支已删 |
| `schemas/*.schema.json` | 内容已演进（三档、删 `mastery`） | **未同步**（见下）；引擎判定走 `config.engine_schema_path()` 读**包内** schema，根那份不读 |
| `.dsh/` | 已删 | **仍在**（旧根安装器 `bin/studymate.mjs` 仍拷 `.dsh/skills`，删了根 `npm test` 红） |
| `templates/MEMORY.md` 等 6 份 | 仍在 | 不动（`memory.py` 读 MEMORY.md） |
| `templates/` 引擎渲染资产（`lesson.html` / `assets/**` 等 72 文件） | 已删 | **仍在**（`scripts/tests/test_openai_plugin.mjs` 仍要求 `templates/lesson.html` 进导出 ZIP） |
| `examples/**` | 已删 | **仍在**（`scripts/build_examples.py` 仍生成它）；但 E2E 种子已于 2026-10-11 迁入 `backend/seed/computer-networks/`，不再依赖它 |
| 工作区发现（`studymate-config.yaml` + `DSH_HOME`） | `lib/workspace.ts` 口径未变 | **零适配**（`sm-workspace`） |

> **为什么根 `schemas/`、`docs/`、`.dsh/`、`templates/` 引擎资产、`examples/` 没能一起同步/删除**：
> 它们和旧根 `scripts/`+`bin/` 是一个**耦合单元**——旧 `scripts/tests` 会交叉校验 schema 配色表
> （`statuses.py` 还是六档）与 `docs/规范/工程约束.md` §四 的脚本清单，旧安装器仍拷
> `.dsh/skills` 与整个 `templates/`。只同步其中几样，根 `npm test` 立刻报
> 「schema 里每个节点状态都有配色 — ['已学完']」等红。上游是把资源和安装器/测试**一起**改掉的
> （其 `bin/studymate.mjs` 已读 `preset/skills`，注释写明「别挪回 `.dsh/skills`」；其 openai 插件
> 测试把 `templates/lesson.html` 列进 **unwanted**）。**要同步就连 `scripts/` 一起同步**，
> 否则维持 `92d1122` 原状——本轮按约定未碰 `scripts/`。

## 6. 回流（合回 `main`）条件与剩余项

ADR-0013 的两个回流条件：

- **条件① 单源项必须单一来源**（schemas、角色规格）：
  1. **技能规格已闭环**（2026-10-11）：`preset/skills` 已同步，9 条链路路由全部解析到。
  2. **`curriculum_store.py` 的六档状态机要按上游《目标态规格》§5.2 映射改造**：包内
     `progress.schema.json` 已是三档（未开始 / 学习中 / 已学完），但 `TRANSITIONS` 与
     `DONE_STATUSES`（`能独立应用` / `已通过项目验证`）仍是旧六档——这两个值在三档 enum 里不存在。
     目前只是潜在：后端只调 `validate_data("curriculum")`，从没用包内 progress 校验器验过
     `progress.yaml`；建课提示词与门禁已同用包内 schema（2026-10-11 修），不会再互相打架。
  3. **根 `schemas/` 内容对齐仍未做**：它必须和根 `scripts/`+`bin/` 一起同步（见 §5 注），
     单独同步会让根 `npm test` 变红。判定源已切包内，所以这一项不再影响 Web 行为，
     只在回流时作为整体单元处理。
- **条件② 允许引擎实现各写一份**——现行做法更优：**消费上游发布物**，规则零分叉。

> **回流手法（ADR-0013 的坑，实操时照抄）**：**不要** `git merge web/0.7.0-beta`——合并基就是当初
> PR 落 `main` 的提交，而 `main` 上已有 `revert(Web运行时)`，git 判「已删 vs 未改」，合完树上什么都不
> 发生。正确路径二选一：① 把 `web/0.7.0-beta` rebase 到当时 `main` 再合；② 在 `main` 上显式
> `revert` 掉那条撤销提交（恢复目录）再 rebase / merge 我们的适配提交。回流前必须满足条件①；
> `web-ci.yml` 随分支保留，回流后照常跑。

## 7. 引擎升版守门

上游升版走 [engine-node/README.md](../engine-node/README.md) 的 checklist：改 `package.json` 的
`@yunmiao/studymate` 版本 → `node setup.mjs` → `npm test`（契约 18 例）→ 全量后端 pytest（含
`tests/test_engine_golden.py` 金样）→ E2E 冒烟。**任何一步红 = 不上。**

金样测试的意义：夹具科目 → Web 产课链 → validate 零阻断 → export ok，与冻结 Python 的结论逐条比对
（同题同错），**抓上游规则的静默变动**。这是「不依赖上游作者同步」的兜底。

## 8. 落地轨迹

五批 rollout 的批次划分与验收口径如下；每批的真实验证数据与会话决策见
[Web_CHANGE.md](../Web_CHANGE.md) 的引擎复用三条 milestone 条目与 [HANDOFF.md](../HANDOFF.md)。

| 批 | 内容 | 验收 |
|---|---|---|
| 1 | `engine-node/` 落地（setup + 三 CLI + 契约测试）；后端旁路校验（不影响主链，结果记审计） | 契约测试绿；真实工作区旁路校验与冻结 Python 结论一致 |
| 2 | YAML 止血（`yaml_out`）+ 迁移工具 + health 检测；迁移真实工作区 | 迁移后真实工作区 export ok |
| 3 | 主链切 node（产课 / 建课 / 工作区发现三线），旁路与双模式退役 | 全量 pytest + E2E 绿；金样比对一致 |
| 4 | 前端 reading 路由切导出应用；`ensure_subject_assets` / render 链退役 | E2E reading 用例过；真机走查「应用内导航」可接受 |
| 5 | 删冻结 Python（只留 `check_pool.py`）+ `engine/` 收缩 + 文档定稿 | `engine/scripts` 仅 1 文件；全套门禁绿 |

**回退**：冻结 Python 已在批 5 退役，故不再有 `STUDYMATE_ENGINE` 开关；若上游包故障需临时回退，
从 git 历史恢复 `engine/` 旧文件即可（完整旧拷贝在提交历史与仓库分支里，逐字节可验）。
