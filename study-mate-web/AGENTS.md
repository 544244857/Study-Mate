# AGENTS.md — study-mate-web

面向在 `study-mate-web/` 子项目里干活的 AI 代理与新人。仓库级约定见根目录 [AGENTS.md](../AGENTS.md)
（只放指针）与 [CONTRIBUTING.md](../CONTRIBUTING.md)；本文件只补 **web 子项目特有**的规则，
同样尽量只给指针。

## 这个子项目是什么

**StudyMate Web**：Study-Mate 的独立 Web 运行时（FastAPI 后端 + Next.js 16 前端）。
自包含工程，不依赖仓库根的 npm 脚本；课程数据与上游 `.learning` 静态工作区同构。

权威文档（都在本目录下）：

| 文档 | 内容 |
|---|---|
| [README.md](README.md) | 启动、配置模型、附件、E2E 测试、版本语义 |
| [StudyMate-Web_开发与计划.md](StudyMate-Web_开发与计划.md) | 架构现状、不变约束、领域模型、客观演进 Backlog |
| [StudyMate-Web_PRD.md](StudyMate-Web_PRD.md) | 功能描述（随代码同步，含实施状态总览） |
| [docs/StudyMate-Web_项目建课链路.md](docs/StudyMate-Web_项目建课链路.md) | **项目基准建课档案**：入口→盘问收口→编排→落点确认，对齐插件/上游基线与 Web 实现 |
| [docs/StudyMate-Web_产课链路与执行契约.md](docs/StudyMate-Web_产课链路与执行契约.md) | **Web 产课专项契约**：单节点课件生成、角色分工、门禁检查、既有产物复用判定与工单流转 |
| [docs/StudyMate-Web_Chat工具面与主动检索设计.md](docs/StudyMate-Web_Chat工具面与主动检索设计.md) | **RFC 专题**：Web 与插件工具面对比分析、主动检索方案设计与选型建议 |
| [docs/StudyMate-Web_引擎复用与回流.md](docs/StudyMate-Web_引擎复用与回流.md) | **引擎复用与回流专题**：上游 npm 消费层架构、CLI 契约、数据卫生、上游包装坑、回流条件与剩余单源项 |
| [docs/StudyMate-Web_前端美化设计.md](docs/StudyMate-Web_前端美化设计.md) | 视觉审美、排版动效与组件布局设计规范（对标 DeepTutor） |
| [StudyMate-Web_E2E测试流程.md](StudyMate-Web_E2E测试流程.md) | E2E 用例与旅程映射（与 `frontend/tests/e2e/` 同步维护） |
| [docs/StudyMate-Web_探索测试指南.md](docs/StudyMate-Web_探索测试指南.md) | 探索 agent 工作流（按需触发，独立于 E2E 门禁） |
| [Web_CHANGE.md](Web_CHANGE.md) | 旧计划与变更史留痕（**只追加、不改写**） |

## 硬规矩

1. **验证门禁**：改 `backend/` 后跑 `python -m pytest tests`（测试依赖见 `backend/requirements-dev.txt`）
   + `python -m compileall app`，并按需起服务 curl 关键端点；改 `frontend/` 后
   `npm run build`（含 TS 严格检查）。改对话/设置/附件等功能后跑 `npm run test:e2e`。
2. **数据合同**：课程/进度口径与根目录 `schemas/*.schema.json` 一致；掌握度状态机的唯一实现是
   `backend/app/curriculum_store.py` 的 `TRANSITIONS`；新词表（importance/lab_status/verdict 等）
   只在该文件定义一次。改词表要两边同步并跑通两边验证。
3. **引擎 = 上游 npm 包，规则零分叉（2026-10-10 起）**：校验 / 导出 / 工作区发现全部走
   **`engine-node/`**（上游 `@yunmiao/studymate` 的消费层：setup.mjs 整形 + sm-export /
   sm-validate / sm-workspace 三 CLI，后端 `app/engine_node.py` 是唯一调用入口）。schema
   一律用包内 `schemas/*.json`——校验规则的单源就是上游包本身；升版 checklist 见
   [engine-node/README.md](engine-node/README.md)。**冻结 Python 只剩
   `engine/scripts/check_pool.py`**（图片库对账，唯一调用方 `image_scout`）；旧
   `STUDYMATE_ENGINE` 双模式与 python 渲染链已退役，别再加回。**schemas/ 与角色规格仍是
   仓库根单源**：schemas 现场读根目录（引擎数据合同以包内 schema 为准做判定、仓库根那份
   回流时对齐）；角色规格按 `preset/skills` → `.dsh/skills` 顺序现场读
   （`config._skills_dir`），都不拷副本。学习工作区发现复用上游 `lib/workspace` 语义
   （优先级：显式参数 > `STUDYMATE_WORKSPACE` > `LEARN_WORKSPACE` >
   `STUDYMATE_CONFIG`/`$DSH_HOME/studymate-config.yaml`），布局与插件同构
   （`<WS>/.learning/subjects`）；node 未就绪时明确报错指引 `node setup.mjs`，不静默降级。
4. **运行时产物不入库**：见本目录 [.gitignore](.gitignore)（`data/`、`.venv`、`node_modules`、
   `.next`、test-results 等）。
5. **代码风格**：Python 必须 `from __future__ import annotations`、非必要不写注释；
   TypeScript 严格模式，除 `app/*/page.tsx` 外一律具名导出。
6. **版本号**：三处一致（`frontend/package.json`、`backend/app/main.py`、侧边栏读 package.json）；
   语义化版本、仅标识 StudyMate Web、与 `@yunmiao/studymate` 独立；**变更需维护者知会同意**。
7. **E2E fixture**：`STUDYMATE_E2E_FIXTURE=1` 仅供测试（canned 响应），未设该环境变量时行为必须
   与生产完全一致；`STUDYMATE_DATA_DIR` 同理仅测试用。
8. **文档同步与维护纪律（治理“文档病”核心规矩）**：
   - **分工明确**：
     - 功能规格与实施状态 → `StudyMate-Web_PRD.md` 对应章节 + 实施状态总览；
     - 架构全景、不变约束与演进规划 → `StudyMate-Web_开发与计划.md`；
     - 里程碑完成、方案变更、事故修复细节与会话决策 → `Web_CHANGE.md` **追加**留痕（只追加、不改写）；
     - 专用复杂链路与深度调研 → 沉淀为 `docs/` 下的专题文档（如产课契约、主动检索 RFC、建课档案、前端美化）；
     - E2E 用例映射 → `StudyMate-Web_E2E测试流程.md`；
     - 探索测试规则 → `docs/StudyMate-Web_探索测试指南.md`；
     - 部署与用户指引 → `README.md`。
   - **长青原则与去会话化（严禁临时时态）**：
     - PRD、开发与计划、专题文档为**长青技术文档（Evergreen）**，仅陈述系统当前的设计现状、客观契约与技术不变量；
     - **严禁**在长青文档中写入“本轮/上一轮/本次修复/某次实测失败/暂未声称成功”等会话式、PR 审查式临时时态词；此类上下文只准进 `Web_CHANGE.md` 或交接文档。
   - **主干骨架与专题下沉**：
     - 主干架构文档保持高层系统全景，模块表只写核心职责（1~2 句话），严禁将防御性补丁、多重特判堆成流水账；深层链路逻辑下沉至专题文档承载。
   - **Backlog 规范分类**：
     - 待办项按客观状态分类（`待实现 Planned` / `方案待决 RFC` / `待外部验证 Blocked` / `明确不纳入 Out of Scope`），严禁使用“第三批全部延期”、“本轮不做”等临时批次标签；
     - 已完成的计划项应及时移出 Backlog 移交归档，主文档只留指向 `Web_CHANGE.md` 的指针，保持主干清爽。
9. **探索测试提醒**：完成较重要的 UI/后端变更后，**必须提醒维护者**是否按
   [探索测试指南](StudyMate-Web_探索测试指南.md) 跑一遍探索测试，并给出建议目标清单。是否执行由维护者定——不像 E2E 那样改完必跑，但提醒本身是义务。

## 端口

后端 8101 · 前端 dev 3800 / 生产 3801 · E2E 用 8290 + 3810。Next 16 生产构建会把代理目标
固化进构建产物（详见根 README 与本目录 README 的说明）。

## 代码发现（codebase-memory-mcp）

>如不存在，请无视

<!-- codebase-memory-mcp:start -->
本项目在 ZCode 项目级 `.zcode/config.json` 注册了 codebase-memory-mcp（仅本仓库生效）。
做代码检索、调用链追踪、架构查询时，优先用其图谱工具（`search_graph`、`trace_path`、
`get_code_snippet`、`query_graph`、`search_code`）而非 grep/逐文件读；
若项目尚未建索引，先跑 `index_repository`。
<!-- codebase-memory-mcp:end -->
