# HANDOFF — StudyMate Web 交接文档

> 面向接手 `study-mate-web/` 子项目的 AI Agent 或开发者。
> **本文定位为当前系统的客观事实与状态索引，具体细节一律通过文档路径查阅**；本子项目不包含任何敏感密钥或 PII，测试用 key 均为占位假值。
> 测试计数一律以当前命令输出为准。

---

## 1. 当前工程现状（客观基准）

- **版本与分支状态**：
  - 当前版本：**`0.8.0-beta`**；工作分支：`feat/study-mate-web`。
  - **2026-10-11 整体同步上游**：把 `upstream/main`（v2.0.1）合并进本分支。合并后根目录（排除 `study-mate-web/` 与 `.github/workflows/web-ci.yml`）与上游**逐字节一致**，本分支相对上游的差异恰为「新增 `study-mate-web/**` + `web-ci.yml`」，纯新增零冲突。**接手先 `git log --oneline -8` 与 `git status` 核实实际落点**，未推送前不要假设已推。
  - 版本号在三处保持严格一致：`frontend/package.json`、`backend/app/main.py` 及前端侧边栏读取点。版本变更需维护者同意。
- **引擎架构演进现状**：
  - **主链 Node 化**：上游 npm 发布物（`@yunmiao/studymate`）接入已就绪，`engine-node/` 承担 `sm-validate lesson`（课件校验）、`sm-validate curriculum`（大纲校验）及 `sm-workspace`（工作区发现）。
  - **规则单源 = 包内 schema**：建课派工值内联的 `curriculum.schema.json` 与 `records.py` 的 schema 校验都走 `config.engine_schema_path()` 读**引擎包内**那份（2026-10-11 修正，此前读仓库根旧基线，与门禁各说各话）；仓库根 `schemas/` 只作对齐副本，**不作判定源**。
  - **引擎包版本**：`engine-node/package.json` 钉 `@yunmiao/studymate`。**2.0.1 起支持 `::: code <语言>` 指令**（规范 `docs/规范/课件内容格式.md` §4 的权威写法带空格；解析端 `lib/core/format.ts` 的 `buildCode` 与阅读端 `lib/client.js` 的 `.smb-code` 框内 caption、alt/caption 进检索串双双就绪），而同步后的 `preset/skills/lesson-design/SKILL.md` 已在教模型用它——低于 2.0.1 会把合规课件判成「未知围栏」打回。**我们侧零使用、零覆盖**：种子课件与前端/后端测试均无 `::: code`，采用范围建议见 §2.2-2。升版走 [engine-node/README.md](engine-node/README.md) 的 checklist（setup → 契约 18 → 金样 → 全量 pytest → E2E）。
  - **根资源对齐上游**：`preset/`（含 `preset/skills` 12 个技能）与根 `README` / `README.en` / `GLOSSARY` / `CONTRIBUTING` / `AGENTS` 已同步；合并 `upstream/main` 后根 `schemas/`、`docs/`、`scripts/`、`bin/`、`lib/`、`templates/`（只剩 6 份模板）全部跟上，`.dsh/` 与 `examples/` 随之消失。E2E 种子课件已迁入 `backend/seed/computer-networks/`，不依赖 `examples/`。
  - **导出阅读端集成**：课件阅读与全工作区主页采用统一导出层（`app/exporter.py` 按需导出，`.stamp` 缓存 + 来源工作区标记防跨区串产物），前端只认 reading 入口返回的 URL（`LessonView` 走 `/api/courses/{slug}/reading`、`HomeEmbed` 走 `/api/home/reading`）内嵌自包含阅读端应用；旧 Python 渲染链路已退役，`engine/` 仅保留 `check_pool.py` 用于采图自检。
- **Agent 工具面与生产编排**：
  - 生产侧（建课 `build.py` 与产课 `produce.py`）采用工具化 Agent 循环与统一门禁自修；建课向导 `generate.py` 已统一复用 `build.run_curriculum_gate` 门禁与硬约束。
  - 对话侧工具面已完成扩容：基础工具包含只读查询及 **K4 子代理分派（`call_subagent`）**；科目关联会话开放动作工具（产课 `produce_lesson`、评估 `assess_node`、大纲状态 `get_course_outline`、误解概念 `read_misconceptions`、历史学习记录 `list_learning_records`）。
- **运行时数据与部署边界**：
  - 运行时数据统一收敛在 `study-mate-web/data/`（配置、会话、草稿、审计日志、上传附件、导出产物）；学习工作区与上游插件目录同构（默认 `~/StudyMate`）。
  - 部署边界严格按**「本机个人单人使用」**设计（无多租户账号与鉴权中心），未补齐鉴权机制前**严禁直接暴露于公网**。

---

## 2. 接下来做什么（真实待办与演进方向）

> 2026-10-11 维护者确认的执行口径：**除 §2.2 三条已有结论/建议外，其余待办一律继续放缓**（不排期、不启动），本节保留为事实快照。

### 2.1 已实施：`curriculum_store` 状态机六档 → 三档（2026-10-12，回流条件① 最后一条代码项闭环）

**做了什么**（权威映射：上游《目标态规格》§5.2 + 包内 `lib/core/rules.ts`）：
- 三档常量与 `TRANSITIONS`（未开始→[学习中]、学习中→[已学完]、已学完→[学习中] 要求复习回退）、`DONE_STATUSES = {已学完}`；`normalize_status()` 读侧映射与包内 `LEGACY_TIER_MAP` 逐条一致，不认识的词退「未开始」。
- `effective_node` / `get_course_outline`（顺带修掉推荐节点永远命不中的旧 bug）读侧归一；`save_progress` / `save_draft_progress` 写回即收敛 + `updated_at` 升 RFC 3339（包内校验器对纯日期是**阻断**项）；评估通过统一置「已学完」；建课首节点不再写 `mastery: 0`。
- 前端 `NodeStatus` 三档、配色表同步、`progress-transition.spec` 期望更新。
- **核心验收已落地**：`test_progress_three_tier.py` 用包内 progress 校验器验 `save_progress` 产物（含旧六档输入写回后放行）。
- E2E 种子 `progress.yaml` 保留旧六档 + mastery 不改写——它是「旧工作区」的活标本，读侧映射全链路被它压着。

**有意保留、待维护者拍板的两项**：① ~~`mastery` 键继续随滑杆/评估写入~~ **已拍板并实施（2026-10-12）**：掌握度完整退场——滑杆移除、PUT/评估不再写、展示面全收；评估记录文件（assessment schema 仍带 mastery）不动，存量 progress 里的旧键原样保留、自然消亡。② ~~误解双落点维持现状~~ **已裁定放入 Backlog（2026-10-12，开发与计划 §5.1 #19）**：误解记录单一落点收敛（§5.4）待上游提案转决定或维护者直接拍板后实施；实施前双落点维持现状（包内校验器只给非阻断提示）。

### 2.2 已敲定 / 已实施（2026-10-11 维护者过审）

1. **PR #165 落点：已定，保持分支现状**。base 仍指 `web/0.7.0-beta`，**不擅自改 base、不 force-push、不自行往 main 合**（PR 正文两节「关于 base」「关于合回 main」即此口径的对外表述）。已知取舍记在案：该 base 下 diff 为 638 文件、混入上游 319 个提交的全部内容；改指 `main` 则 diff 恰为 303 个纯新增文件。合回 main 的最后一步由维护者执行（ADR-0013 的 revert 落点，两条配合路径见 PR 正文）。**此条已闭环，不再是待决策项。**

2. **`::: code` 指令采用范围：已按建议实施（2026-10-11）**。做了什么、留了什么：
   - **规格可达（核心，已做）**：`config.engine_doc_path()`（照 `engine_schema_path` 先例，vendor → node_modules，不回落到仓库根）+ `produce._code_directive_spec()` 从**引擎包内**《课件内容格式》§4 摘出 `::: code` 那一节（43 行），内联进 `content_values` 与 `experiment_values`；摘不到时回落手写摘要（三条边界 + 三条报错码）。不动 `preset/skills/**`（技能单源）。
   - **种子正例（已做）**：`0003-net.ip.md` 的 term 输出块连同框外解释提为顶层 `::: code term`，其余围栏不动。注意种子里的「围栏 + 框外解释」全在 `::: practice` 块内，**指令块不能嵌套**（`directive-nested`），所以是提到顶层而非就地改。
   - **回归三层（已做）**：`test_code_directive_values.py`（4 条，摘录内联/包内来源/缺失回落）；`test_engine_golden.py` 金样（合法放行、`caption:` 写进指令头按 code-lang 阻断、导出产物带 caption）；E2E `courses.spec.ts` 新用例（SPA 内进科目 → 目录点开 0003，断言 `.smb-code` 内 `.smb-code__caption` 渲染——阅读端给所有代码块都套 `.smb-code` 外壳，**只有 `::: code` 产 caption**）。
   - **顺带发现的上游 reader 坑（待反馈，未动上游）**：`lib/client.js` 内嵌解析器的行级正则不容忍 `\r`（`.` 不匹配 `\r`、`$` 无 `m` 标志），**CRLF 的课件**会让带参数的 `:::` 指令与标题整段退化成原文段落。真机产课落盘是 LF（`roles.write_deliver` 的 `newline="\n"`）不受影响；E2E fixture 已在 `global-setup.ts` 加 `normalizeLineEndings()` 镜像仓库提交的 LF 字节（Windows 检出被 autocrlf 翻成 CRLF，Linux CI 一直是 LF 所以没人撞上）。**用户手改成 CRLF 的课件仍会在阅读端退化**——这是上游兼容问题，是否反馈由维护者定。

3. **上游两个包装坑：已写进 PR #165 正文，无需另外动作**（2026-10-11 核实）。PR 正文「想请上游附带看两眼的两件事」一节已完整覆盖：① 发布包 `lib/` 是 `.ts` 源码，node 拒绝 type-strip `node_modules` 里的它（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`），必须整包拷出才能用；② 导出 React 解析只认 `react-dom/node_modules/scheduler` 的 pnpm 式嵌套，npm 平铺会把 scheduler 提顶层而报 `EXPORT_REACT_MISSING`，且发布包不声明 react / react-dom 依赖。**原「PR #43 评论是现成通道」作废**——#43 早已 MERGE，现成通道就是仍开放着的 #165。

### 2.3 其他待办（2026-10-11 起维持放缓，不排期）

- **主动检索（Resource Scout）方案拍板（规划项 #9）**：解决从零建课时资料清单为空导致采图跳过的问题；三种演进路线评估详见专题文档 [Chat工具面与主动检索设计.md](docs/StudyMate-Web_Chat工具面与主动检索设计.md)。
- **真实模型长流式与复杂思考参数验证（规划项 #3）**：待外部网关稳定后，针对 Anthropic 与 OpenAI Responses 格式的长思考参数进行全链路真实验证。
- **探索测试提醒（AGENTS.md 规矩 9）**：本轮合并 + 升引擎包 + 门禁顺序都属于较重要改动，**必须提醒维护者**是否按 [探索测试指南](docs/StudyMate-Web_探索测试指南.md) 跑一轮探索测试。

---

## 3. 权威文档地图

| 文档路径 | 核心内容与用途 |
|---|---|
| [README.md](README.md) | 启动/停止、配置模型、附件支持、E2E 测试与部署边界 |
| [StudyMate-Web_开发与计划.md](StudyMate-Web_开发与计划.md) | 系统架构现状、11 条不变约束、领域数据模型与客观演进 Backlog |
| [StudyMate-Web_PRD.md](StudyMate-Web_PRD.md) | 功能规格说明（描述当前已实施状态） |
| [docs/StudyMate-Web_项目建课链路.md](docs/StudyMate-Web_项目建课链路.md) | 项目基准建课档案：方向盘问收口 → 草稿生成 → 大纲编排 → 工作区 Promote |
| [docs/StudyMate-Web_产课链路与执行契约.md](docs/StudyMate-Web_产课链路与执行契约.md) | 单节点课件生产规范：角色分工、Lab 交付契约、产物复用判定与工单流转 |
| [docs/StudyMate-Web_Chat工具面与主动检索设计.md](docs/StudyMate-Web_Chat工具面与主动检索设计.md) | RFC 专题：Web 与插件工具面对比分析、主动检索方案设计与选型建议 |
| [docs/StudyMate-Web_引擎复用与回流.md](docs/StudyMate-Web_引擎复用与回流.md) | 引擎复用与回流专题：上游 npm 消费层架构、CLI 契约、数据卫生、回流条件与剩余单源项 |
| [docs/StudyMate-Web_前端美化设计.md](docs/StudyMate-Web_前端美化设计.md) | 视觉审美、排版动效与组件布局设计规范 |
| [StudyMate-Web_E2E测试流程.md](StudyMate-Web_E2E测试流程.md) | E2E 用例与用户旅程映射表（与测试套件同步） |
| [docs/StudyMate-Web_探索测试指南.md](docs/StudyMate-Web_探索测试指南.md) | 探索测试 Agent 工作流（按需触发） |
| [Web_CHANGE.md](Web_CHANGE.md) | 变更史与架构决策留痕（只追加、不改写） |
| [engine-node/README.md](engine-node/README.md) | Node 引擎 CLI 契约与使用说明 |

---

## 4. 已知技术坑与防御不变量

1. **长任务执行与进度观察**：
   - 前端通过 `progress` 快照观察编排进展；审计日志记录于 `data/audit/*.jsonl`（思维链正文不落审计）。
   - 单轮聊天受 `STUDYMATE_CHAT_MAX_SECONDS`（默认 300s）、编排受 `STUDYMATE_ORCH_MAX_SECONDS`（默认 1800s）硬上限保护。
2. **会话存储原子写与并发互斥**：
   - 会话存储采用整文件读改写，必须通过临时文件 + `os.replace` 原子替换；
   - 进程内设立 Reject-only 注册表，同一会话或同一工作区节点的并发写请求直接返回 `409 Conflict`，坚决不排队、不静默合并。
3. **流式生命周期与消息持久化**：
   - 助手消息按流式顺序持久化为多类型 `parts`（文本、思维链、过程提示、工具调用及结果）；
   - 包含错误的轮次持久化 `error` 与 `stream_state="error"`，即使正文为空也不得丢弃，确保刷新后诊断可回放。
4. **前端构建产物与新鲜度隔离**：
   - 生产环境伺服 `.next` 构建快照，不随源码热重载；修改前端代码后必须重新执行 `next build`；
   - 并行开发或构建时务必做好产物隔离，避免并发构建互相覆盖。
5. **测试端口占用与测试隔离**：
   - E2E 默认使用 `8290`（后端）与 `3810`（前端）；全量 E2E 测试必须串行执行，避免端口互踩。
   - `STUDYMATE_E2E_FIXTURE` 环境变量仅用于测试，未设置时行为与生产完全一致。
6. **耗时同步重活脱离事件循环**：
   - 门禁子进程调用、大文件文本抽取等同步重活必须通过 `asyncio.to_thread` 执行，严禁阻塞异步主事件循环导致 SSE 流冻结。
7. **LLM 适配层超时语义**：
   - 适配层超时为 per-read 超时而非总耗时上限；底层客户端配置 `max_retries=0`，重试与退避机制完全由上层适配逻辑接管。
8. **生效模型三元组口径**：
   - 会话模型以 `sessionActive ?? settings.active` 为唯一口径；上下文窗口计算、Key 存在性判断与助手名称回显均严格以此为准。
9. **E2E 断言防御性陷阱**：
   - 避免模糊匹配（如 `toBeHidden()` 需单一定位、`<details>` 内部 summary 避让、Canvas 多层穿透等）；工具卡常显时注意 `process-panel` 可能整块不渲染。
10. **大纲与课件沙箱可达性**：
    - 工具沙箱读根仅限工作区，无法读取仓库根目录；建课大纲派工值必须内联**引擎包内** `curriculum.schema.json` 全文与关键约束，否则模型易盲猜引发门禁反复打回。

11. **从上游 checkout 资源后，`git checkout HEAD -- <dir>` 撤不干净**（2026-10-11 连踩两次）：
    - `git checkout upstream/main -- <dir>` 会把**上游独有、HEAD 里没有的文件**也加进索引；之后用
      `git checkout HEAD -- <dir>` 只能还原 HEAD 里存在的路径，那些新增文件**仍以 A（新增）态留在索引里**，
      `git status` 却看不出来。撤干净的办法：`git -c core.quotePath=false diff --cached --name-only
      --diff-filter=A -- <dir> > /tmp/x.txt`，再 `git rm --cached --pathspec-from-file=/tmp/x.txt` 并删磁盘文件。
    - 同理，`git commit` 会连带提交所有已暂存内容——**提交前务必 `git diff --cached --name-only` 核对暂存清单**，
      别指望 `git add <想提的>` 能排除掉之前暂存的东西。
12. **根目录退出码不能从管道后取**：`npm test 2>&1 | tail` 的 `$?` 是 `tail` 的。要判红绿必须
    `npm test >/tmp/x.log 2>&1; echo $?`。根 `npm test` 全绿时输出里也可能出现 `✖` 字样，以 exit code 为准。
---

## 5. 开发环境与运行事实

- **运行依赖**：
  - 后端：Python 3.10+，虚拟环境位于 `backend/.venv`（Windows 下调用 `.venv/Scripts/python.exe`）；测试依赖见 `backend/requirements-dev.txt`。
  - 前端：Node.js 20.9+，Next.js 16。
- **本地真实 LLM 渠道**：
  - 本机支持通过 new-api 中转（`http://localhost:4000/v1`），支持中转多模型及思考档位测试。
  - 真实模型冒烟脚本：`SMOKE_REAL_LLM=1 SMOKE_MODEL=<名> .venv/Scripts/python.exe -m pytest tests/test_smoke_real_llm.py -s -q`。
- **服务端口**：
  - 后端：`8101`（健康检查路由为 `/api/health`）；
  - 前端：dev `3800` / 生产 `3801`；
  - 快捷脚本：启动 `start-web.bat` / 停止 `stop-web.bat`（GBK 编码，CRLF 换行）。
- **常用质量检查命令**：
  - 后端测试：`cd backend && .venv/Scripts/python.exe -m pytest tests -q`
  - 后端编译：`cd backend && .venv/Scripts/python.exe -m compileall app`
  - 前端构建与检查：`cd frontend && npm run build && npm run lint`
  - 组件测试：`cd frontend && npm run test:component`
  - E2E 测试：`cd frontend && npm run test:e2e`

---

## 6. 常用辅助 Skills

- `playwright-cli`：排查与调试 E2E 测试、录制 trace、分析页面结构。
- `github:pr` / `github:issue`：跟进分支 Pull Request 及上游 issue。
- `handoff`：后续任务告一段落时生成新版交接文档（覆写本文，保持干净的事实快照结构）。
