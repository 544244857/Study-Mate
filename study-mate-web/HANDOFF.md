# HANDOFF — StudyMate Web 交接文档

> 面向接手 `study-mate-web/` 子项目的 AI Agent 或开发者。
> **本文定位为当前系统的客观事实与状态索引，具体细节一律通过文档路径查阅**；本子项目不包含任何敏感密钥或 PII，测试用 key 均为占位假值。
> 测试计数一律以当前命令输出为准。

---

## 1. 当前工程现状（客观基准）

- **版本与分支状态**：
  - 当前版本：**`0.8.0-beta`**；工作分支：`feat/study-mate-web`，已对齐上游 `web/0.7.0-beta`（ADR-0013「自带引擎的第二形态」）。
  - 版本号在三处保持严格一致：`frontend/package.json`、`backend/app/main.py` 及前端侧边栏读取点。版本变更需维护者同意。
- **引擎架构演进现状**：
  - **主链 Node 化**：上游 npm 发布物（`@yunmiao/studymate`）接入已就绪，`engine-node/` 承担 `sm-validate lesson`（课件校验）、`sm-validate curriculum`（大纲校验）及 `sm-workspace`（工作区发现）。
  - **规则单源 = 包内 schema**：建课派工值内联的 `curriculum.schema.json` 与 `records.py` 的 schema 校验都走 `config.engine_schema_path()` 读**引擎包内**那份（2026-10-11 修正，此前读仓库根旧基线，与门禁各说各话）；仓库根 `schemas/` 已随上游同步到三档，仅作对齐副本。
  - **根资源部分对齐上游**：`preset/`（含 `preset/skills` 12 个技能）与根 `README` / `README.en` / `GLOSSARY` / `CONTRIBUTING` / `AGENTS` 已同步到上游 `main`。根 `schemas/`、`docs/`、`.dsh/`、`templates/` 引擎资产、`examples/` **未同步也未删**——它们与旧根 `scripts/`+`bin/` 是耦合单元，只动几样会让根 `npm test` 变红，要同步就得连 `scripts/` 一起（见回流专题 §5 注）。E2E 种子课件已迁入 `backend/seed/computer-networks/`，不再依赖 `examples/`。
  - **导出阅读端集成**：课件阅读与全工作区主页采用统一导出层（`app/exporter.py` 按需导出与 `.stamp` 缓存），前端 `LessonView` 与 `HomeEmbed` 内嵌自包含阅读端应用；旧 Python 渲染链路已退役，`engine/` 仅保留 `check_pool.py` 用于采图自检。
- **Agent 工具面与生产编排**：
  - 生产侧（建课 `build.py` 与产课 `produce.py`）采用工具化 Agent 循环与统一门禁自修；建课向导 `generate.py` 已统一复用 `build.run_curriculum_gate` 门禁与硬约束。
  - 对话侧工具面已完成扩容：基础工具包含只读查询及 **K4 子代理分派（`call_subagent`）**；科目关联会话开放动作工具（产课 `produce_lesson`、评估 `assess_node`、大纲状态 `get_course_outline`、误解概念 `read_misconceptions`、历史学习记录 `list_learning_records`）。
- **运行时数据与部署边界**：
  - 运行时数据统一收敛在 `study-mate-web/data/`（配置、会话、草稿、审计日志、上传附件、导出产物）；学习工作区与上游插件目录同构（默认 `~/StudyMate`）。
  - 部署边界严格按**「本机个人单人使用」**设计（无多租户账号与鉴权中心），未补齐鉴权机制前**严禁直接暴露于公网**。

---

## 2. 接下来做什么（真实待办与演进方向）

1. **回流准备（上游新 main 对齐，专题见 [引擎复用与回流.md](docs/StudyMate-Web_引擎复用与回流.md) §6）**：
   - **`curriculum_store.py` 状态机六档 → 三档映射**：根 `schemas/` 与包内 `progress.schema.json` 都已是三档（2026-10-11 已同步），但 `TRANSITIONS` / `DONE_STATUSES` 仍是旧六档，需按上游《目标态规格》§5.2 改造。
   - ~~`preset/skills` 规格漂移核验~~ **已闭环**（2026-10-11 随上游同步，9 条链路路由全部解析到）。
   - 回流时机等维护者；**忌** `git merge web/0.7.0-beta`（合并后树上什么都不发生，属空操作）。
2. **主动检索（Resource Scout）方案拍板（规划项 #9）**：
   - 解决从零建课时资料清单为空导致采图跳过的问题；三种演进路线评估详见专题文档 [Chat工具面与主动检索设计.md](docs/StudyMate-Web_Chat工具面与主动检索设计.md)。
3. **真实模型长流式与复杂思考参数验证（规划项 #3）**：
   - 待外部网关稳定后，针对 Anthropic 与 OpenAI Responses 格式的长思考参数进行全链路真实验证。

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

## 4. 已知技术坑与防御不变量（Top 10）

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
