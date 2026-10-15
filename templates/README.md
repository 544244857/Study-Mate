# templates/ — 工作区数据骨架

这里的文件**不是页面模板**（页面模板随静态渲染一起退役，见 [ADR-0005](../docs/adr/0005-静态页面降为导出.md)），
而是**新建学习工作区时要写进工作区的文件骨架**：总控与「档案维护规范」按它们建科目、写共享记忆。

| 文件 | 什么时候用 | 写到工作区的哪 |
|---|---|---|
| `MEMORY.yaml` | 首次初始化工作区 | `.learning/MEMORY.yaml`（只在缺失时复制，不覆盖已有记忆） |
| `subject.yaml` | 新建一门科目 | `.learning/subjects/<slug>/subject.yaml` |
| `MISSION.md` | 新建一门科目 | `.learning/subjects/<slug>/MISSION.md` |
| `RESOURCES.md` | 新建一门科目／「资料收集」交回清单后 | `.learning/subjects/<slug>/RESOURCES.md` |
| `GLOSSARY.md` | 新建一门科目（先写 `## 待掌握`） | `.learning/subjects/<slug>/GLOSSARY.md` |
| `lab/`（目录树） | **出题角色**造 lab 时（`kind: 实操`／`kind: 实验`），照抄后只填题目与断言 | `.learning/subjects/<slug>/lab/` |

- `lab/` 是**整棵目录树**的骨架（任务目录、答案目录、lab 说明、判分入口 `check.sh`、
  断言、作答与探针，以及干净态／作答态两个运行入口 `干净态.sh`／`作答态.sh` 与自检 `自检.sh`），
  不是建科目时自动落盘的那几个文件：概念课不产 lab，
  空着一份骨架只会是假产物。造 lab 的那一步从 `<root>/templates/lab/` 照抄，
  把示例目录改名成 `<NNNN>-<主题>`、换掉题目与断言——判分入口、两个运行入口、布局与自检
  都照抄，别另起一套。判分契约见 `layered-practice` 第六节；路径与维护者见
  [文件归属](../docs/规范/文件归属.md)。

- **文件归属与代称**的唯一出处是 [文件归属](../docs/规范/文件归属.md)；字段形状以 `schemas/` 为准
  （`subject.yaml` ↔ `subject.schema.json`；`MEMORY.yaml` 是 YAML 分节，其余是 Markdown，
  按文件里的分节写）。
- 骨架里的空白处按注释替换（`MEMORY.yaml` 里画像三节的 `[]`、`积累` 的空映射 `{}` 都是「这一节还没有
  条目」）；**不留占位符文字**（学生看到的是成品，不是模板）。记忆的注入边界（只有画像三节进上下文）
  在 `lib/core/memory.ts`：`积累` 是给角色干活用的（角色按需 grep 键去读），它不进任何自动注入。
- 改这里的骨架会同时影响 DSH 与两个无头宿主插件（插件构建把 `templates/` 打进产物），
  所以改完两边都要想一遍：无头侧的总控读的是 `<root>/templates/MEMORY.yaml`。
- 仓库里**不再有页面模板与前端资源**：Sayo UI、KaTeX、`learn-theme.*` 与三个课件层组件
  （`style.css` / `quiz.js` / `lesson-toc.js`）已随静态渲染退役，渲染与判分都在阅读端；
  学生要离线副本时走导出（`npx -y @yunmiao/studymate export`）。
