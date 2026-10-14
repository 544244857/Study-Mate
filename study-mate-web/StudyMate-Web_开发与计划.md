# StudyMate Web 开发与计划

> 版本：v1.2（架构现状与演进规划）
> 定位：**长青开发架构文档 + 演进计划文档**。描述系统当前架构现状、核心机制与不变约束、领域模型、与上游仓库的关系，以及后续客观规划（Backlog）。
> 文档分工与索引：
> - 功能规格与实施状态 → [StudyMate-Web_PRD.md](StudyMate-Web_PRD.md)
> - 测试流程与用例映射 → [StudyMate-Web_E2E测试流程.md](StudyMate-Web_E2E测试流程.md)
> - 变更历史与决策留痕（只追加）→ [Web_CHANGE.md](Web_CHANGE.md)
> - 项目基准建课全链路档案 → [docs/StudyMate-Web_项目建课链路.md](docs/StudyMate-Web_项目建课链路.md)
> - Web 单节点产课执行契约 → [docs/StudyMate-Web_产课链路与执行契约.md](docs/StudyMate-Web_产课链路与执行契约.md)
> - Chat 工具面与主动检索 RFC → [docs/StudyMate-Web_Chat工具面与主动检索设计.md](docs/StudyMate-Web_Chat工具面与主动检索设计.md)
> - 视觉审美与组件布局规范 → [docs/StudyMate-Web_前端美化设计.md](docs/StudyMate-Web_前端美化设计.md)
> - 本地启动/配置/部署说明 → [README.md](README.md)

---

## 1. 架构现状（0.7.0-beta）

```
浏览器 ──► Next.js 16 前端（同源）
              │  /api/* 由 Next.js rewrites 代理
              ▼
           FastAPI 后端 ──► LLM（三种 API 格式适配层；按链路注入 preset/skills 全文）
              │               ├─ openai_chat   {base}/chat/completions
              │               ├─ openai_responses {base}/responses
              │               └─ anthropic     {base}/v1/messages
           study-mate-web/data/  运行时数据（settings、sessions、uploads、audit）
           学习工作区 <WS>/.learning/subjects/  与插件同构（发现走 sm-workspace，默认 ~/StudyMate）
```

### 1.1 后端模块职责（backend/app/）

| 模块 | 职责定位 |
|---|---|
| `main.py` | 应用入口：lifespan 生命周期管理（工作区初始化、待清理上传清扫）、路由注册与全局版本常量。 |
| `config.py` | settings v3 配置读写与平滑迁移；多 Provider 管理、掩码回传、活动模型解析与系统提示词默认值。 |
| `llm.py` | 统一 LLM 适配层：OpenAI/Anthropic 三种格式适配、流式工具聚合、思维链透出与重试管理。 |
| `multimodal.py` + `doc_extract.py` | 附件多模态处理：图片格式适配、文本提取（pdf/docx/xlsx/pptx/epub）及模型模态降级回退。 |
| `curriculum_store.py` | 课程存储与核心领域状态机（`TRANSITIONS` 唯一实现）；会话级工作区目录解析唯一收口点。 |
| `workspace.py` + `workspace_ctx.py` | 工作区自动发现与校验；基于 ContextVar 的请求级与会话级工作区动态绑定（可重入）。 |
| `prompts.py` + `roles.py` | 链路提示词分层组装；技能文件（`preset/skills` → `.dsh/skills` 动态解析）全文注入、角色派工基建与 Envelope 解析。 |
| `memory.py` + `misconceptions.py` | 跨科目记忆库 `MEMORY.md` 增量管理；误解概念本双落点（`misconceptions.yaml`）同步机制。 |
| `records.py` + `tickets.py` | 评估记录解析校验（遵循根目录 schemas）；质检工单存储、状态流转与重试编排。 |
| `storage.py` + `audit.py` | 文件型会话存储（消息 parts、模型参数与用量统计）；操作审计日志（`data/audit/`）落盘。 |
| `agent.py` + `tools.py` | Agent 执行循环驱动器（轮次控制、超时预算）；沙箱边界管理与工具注册表（基础只读工具、K4 子代理 `call_subagent`，以及科目动作工具 `produce_lesson`、`assess_node`、`get_course_outline`、`read_misconceptions`、`list_learning_records`）。 |
| `errors.py` | 统一结构化错误对象 `ErrorInfo`；会话与轮次作用域的停止/取消控制器（`register_turn`/`request_stop`）。 |
| `produce.py` + `build.py` | 业务生产编排：建课编排与单节点课件生成。详细契约见专项文档 [产课链路与执行契约](docs/StudyMate-Web_产课链路与执行契约.md) 与 [项目建课链路](docs/StudyMate-Web_项目建课链路.md)。 |
| `draft.py` + `image_scout.py` | 建课草稿区（`data/drafts/`）与 Promote 落盘确认；采图爬虫（基于参考链接配额下载）。 |
| `routers/` | HTTP/SSE 路由接入层：聊天流式交互、工作区静态服务、课程管理、配置、评估、导出与建课向导（generate 复用 build 门禁）。 |

### 1.2 前端结构与页面组织（frontend/）

- **路由拓扑**：
  - `/chat`：对话学习主页面（支持新对话配置、关联科目与历史回溯）。
  - `/courses`：课程大纲与知识图谱（不带参数为主页，带 `?subject=` 为科目视图）。
  - `/lesson`：课件阅读与答题练习工作台。
  - `/misconceptions`：跨科目误解记录本。
  - `/settings`：系统设置（Provider、模型档位、系统提示词、工作区与关于）。
- **核心组件分工**：
  - `ChatView` / `Composer`：对话流展示、输入控制、多模态附件、推理档位选择与中间过程折叠。
  - `RightSidebar` / `SubjectGraphPanel`：右侧上下文抽屉、科目图谱/大纲树无缝切换与附件清单。
  - `ErrorNotice`：统一错误警告组件（支持 neutral 中断与 danger 故障两态，提供展开诊断与一键复制）。
  - `HomeEmbed`：工作区主页视图：先经 `/api/home/reading` 按需导出（缓存命中秒回）再嵌导出应用，带加载 / 错误（可重试）态，感知会话工作区。

### 1.3 核心对外契约要点

- **SSE 流式事件规范**：
  - 会话流统一分发 `session`、`delta`、`reasoning`（思维链）、`notice`（过程提示）、`tool_call`、`tool_result`、`usage`、`done`、`error`。
  - 思维链与工具调用随助手消息一同持久化落盘，页面刷新后完整回放。
- **统一错误契约（ErrorInfo）**：
  - `error` 事件及异常 HTTP 响应均平铺结构化 `ErrorInfo`（包含 `code`、`status`、`phase`、`summary`、`detail`、`retryable`、`request_id` 等）。
  - 助手消息持久化记录 `stream_state ∈ {streaming, completed, interrupted, error}` 与 `error` 实体。
- **消息片段模型（Parts）**：
  - 助手消息按流式顺序持久化为多类型 `parts`（文本、思维链、过程提示、工具调用及结果）。前端合并相邻文本与思维链，过程提示独立展示。
  - 单轮对话绑定固定 `turn_id` 原位 upsert；停止/取消操作限定在 `(session_id, turn_id)` 作用域，不影响全局。
- **并发写互斥拒绝（R2/R8）**：
  - 进程内设立 Reject-only 注册表，同一会话或同一工作区节点的并发写请求直接返回 `409 Conflict`，坚决不排队、不静默合并。
- **Settings v3 配置规范**：
  - Provider 支持 `openai_chat`、`openai_responses`、`anthropic` 三种格式；API Key 采用后端脱敏掩码回传，空串与掩码在保存时自动保留原值。
- **课程生产与产物复用契约**：
  - 单节点产课（`produce_lesson`）仅对科目关联会话开放，严格按大纲顺序处理未产出节点。
  - 产物复用、Lab 三文件交付契约、渲染自检与打回重试机制详见专项文档 [StudyMate-Web_产课链路与执行契约.md](docs/StudyMate-Web_产课链路与执行契约.md)。

---

## 2. 关键机制与不变约束（核心铁律）

1. **领域口径唯一**：状态机唯一实现在 `curriculum_store.py` 的 `TRANSITIONS`，与根目录 `schemas/*.schema.json` 保持严格一致；误解记录保持 `progress.yaml` 与科目 `misconceptions.yaml` 双落点同步。
2. **模态两段式适配**：输入端不拦截多模态文件；发送端依据当前模型能力按需注入或生成占位文本；遇到上游模态报错时自动剔除重试一次。
3. **工作区同构与统一发现**：学习数据规范存储于 `<WS>/.learning/subjects/<slug>/`；工作区发现统一走 `sm-workspace`（上游 `lib/workspace` 语义，优先级与旧 `learn_workspace()` 逐字一致），默认路径 `~/StudyMate`，不自动预种示例数据。
4. **会话级工作区隔离**：会话独立绑定工作区路径，不做全局工作区切换；唯一收口点为 `curriculum_store.workspace_dir()`；绑定路径必须已存在，否则校验失败。
5. **消息操作与中间过程落盘**：编辑操作语义为“截断后续并重发”，删除操作为“整轮成对删除”；思维链、工具调用与用量一律持久化，前端折叠区依据落库数据准确回显。
6. **推理档位语义规整**：显式开关（如 off/on）作为思考开关处理，档位名称统一归一化映射，避免底层协议报错。
7. **工具化调用与提示词分层**：链路提示词现场全文读取 `preset/skills/<名>/SKILL.md`（`config._skills_dir()` 按 `preset/skills` → `.dsh/skills` 取第一个存在的）；工具调用默认开启；质检工单仅作为循环耗尽后的兜底手段。
8. **引擎规则零分叉**：渲染 / 课件与大纲校验 / 工作区发现全部调用 `engine-node/` 的 CLI（后端 `app/engine_node.py` 是唯一调用入口，规则单源 = 上游 npm 包 `@yunmiao/studymate`）；门禁必须在写盘后执行，判定口径：放行 exit 0、阻断 exit 2、CLI 自身错误 exit 1。
9. **会话科目严格绑定**：科目关联仅在新对话初始化时指定，会话中途不可变更；未关联科目的会话不得调用产课与评估动作工具。
10. **超时控制与异步非阻塞**：区分单次读取超时与全局墙钟预算（聊天 300s / 编排 1800s）；进程内耗时重活（门禁子进程、文本抽取）一律脱离主事件循环执行。
11. **测试隔离与运行时规范**：测试环境变量（`STUDYMATE_E2E_FIXTURE` 等）未设置时行为与生产完全一致；运行时数据不入版本库；生产构建必须配置 `compress: false` 保证 SSE 正常流转。

---

## 3. 领域模型与数据口径

- **curriculum.yaml**：节点定义（`nodes[]`：id、title、kind 概念/实操/实验、objective、prerequisites、mastery 等）与拓扑边（`edges[]`：from、to、reason）。
- **progress.yaml**：学习进度跟踪（`nodes` 掌握度状态与 notes、`misconceptions[]` 误解条目、`project.current` 当前项目）。
- **模式单源性**：所有 YAML 数据结构与 front-matter 规范以根目录 `schemas/*.schema.json` 为唯一权威来源。

---

## 4. 与上游仓库及引擎的关系

- **数据合同唯一来源**：根目录 `schemas/` 为仓库唯一数据口径，Web 侧完全遵循。
- **引擎 = 上游 npm 包（ADR-0013 回流条件②）**：建课大纲与产课校验、主页生成、工作区发现全部走 `engine-node/` 消费层（`sm-export` / `sm-validate` / `sm-workspace`），规则零分叉、版本钉在 `engine-node/package.json`；冻结 Python 只剩 `engine/scripts/check_pool.py`（图片库对账）。架构与回流条件详见 [docs/StudyMate-Web_引擎复用与回流.md](docs/StudyMate-Web_引擎复用与回流.md)。
- **提示词与技能单源**：角色技能（`preset/skills`，旧位置 `.dsh/skills`）与上游保持单一来源，现场动态读取，不复制副本。
- **静态工作区兼容**：生成的学习工作区与上游 DSH 插件格式完全一致，可通过 `STUDYMATE_WORKSPACE` 环境变量无缝接管已有静态工作区。

---

## 5. 待实现计划（Backlog）

> 维护约定：本计划表按工程状态进行客观分类维护。已完成的历史特性与修复细节全量归档于 [Web_CHANGE.md](Web_CHANGE.md)（含 #16 K4 子代理与 generate 统一、#29 Chat 工具面扩容等），主文档不留冗余流水账。

### 5.1 待实现（Planned）

| # | 计划项 | 目标与说明 |
|---|---|---|
| 4 | 附件能力扩展 | 支持音频与视频附件解析；支持富文档内嵌图片提取与 OCR 处理。 |
| 8 | 会话存储 SQLite 迁移 | 会话数据由文件型存储演进为 SQLite，提升海量消息与并发检索性能。 |
| 13 | 模态直传改造 | 清理 `vision` 字符串过渡垫片，改为直接传递标准 `modalities` 结构。 |
| 15 | Lab 代码沙箱执行 | 建设本地子进程代码安全执行环境，支持实操与实验课代码自动评测。 |
| 17 | 记忆与小结入口接回 | 接回右栏悬空的会话摘要与记忆沉淀入口，移除相关测试跳过标记。 |
| 18 | 会话工作区路径放宽 | 支持指定尚不存在的工作区目录（自动按需创建），优化新建体验。 |
| 19 | 误解记录单一落点收敛 | 误解记录从「misconceptions.yaml + progress.yaml 副本」双落点收敛为单一落点（上游《目标态规格》§5.4）：`misconceptions._sync` 去 progress 侧写入、`save_progress` 落盘时清掉存量副本键、保留「缺 misconceptions.yaml 时从 progress 迁移」的读侧兜底；调整 `misconceptions.py` / `test_misconception_mapping.py` 的双落点断言。**实施前置**：上游 §5.4 提案转成决定（或维护者直接拍板）；包内 progress 校验器当前对该副本键只给非阻断提示，不构成阻塞。 |

### 5.2 方案待决 / 调研中（RFC / Under Review）

| # | 计划项 | 当前进展与决策点 |
|---|---|---|
| 3 | 真实模型全格式流式验证 | 已完成基础链路冒烟；待针对 Anthropic / OpenAI Responses 真实复杂思考参数进行全链路长流验证。 |
| 9 | 主动检索（Resource Scout）支持 | 解决从零建课资料清单为空、导致采图跳过的问题。技术对比与三条演进路线详见专题文档 [Chat工具面与主动检索设计](docs/StudyMate-Web_Chat工具面与主动检索设计.md)。 |

### 5.3 待外部验证（Blocked / Pending External）

| # | 计划项 | 当前进展与依赖项 |
|---|---|---|
| 35 | lint / CI / 依赖锁（R3/R4） | **本地全部验证通过**：ESLint 0 错误、web-ci smoke 测试通过、uv 依赖锁（hash 校验）就绪。等待远端分支推送并在 GitHub Actions CI 环境中完成全量验证。 |

### 5.4 明确不纳入范围（Out of Scope）

- **多用户账号体系与云端同步**：StudyMate Web 明确保持为个人本地独立运行时，不引入账号注册、鉴权中心与云端多租户数据库。
