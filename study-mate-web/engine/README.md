# engine/ — Web 运行时的冻结 Python 收缩层

> **历史与现状**：2026-10-07 本目录曾是「自带引擎的第二形态」整份拷贝（5 入口 + 6 helper
> + 3 模板 + assets，见 ADR-0013 回流条件②）。2026-10-10 起消费层切换为上游 npm 发布物
> `@yunmiao/studymate`（见 `../engine-node/README.md` 与
> `../docs/StudyMate-Web_引擎复用与回流.md`），渲染 / 质检 / 主页生成 / 大纲校验全部走
> node 侧 CLI，**本目录只剩最后一个冻结脚本**。

## 内容

| 路径 | 内容 | 为什么留着 |
|---|---|---|
| `scripts/check_pool.py` | 图片库索引对账（索引表 ↔ `assets/img/pool/` 逐行对账） | 上游把它 port 在工具层且需要 DSH 的 `DomainAccess`，暂不值得为它写 shim；其格式最稳定 |

**唯一调用方**：`backend/app/image_scout.py`（采图链的图片库门禁），子进程调用，与
node 引擎无关。schemas 一律现场读仓库根 `schemas/`（回流条件①的单源项，不拷副本）。

## 回退

`STUDYMATE_ENGINE` 环境变量与 python 渲染链已随本批退役：引擎主链只有 node 一条路，
规则单源 = 上游 npm 包（版本钉在 `engine-node/package.json`）。若上游包故障需要临时回退，
从 git 历史恢复本目录旧文件即可（完整旧拷贝在提交历史与本仓库分支里，逐字节可验）。
