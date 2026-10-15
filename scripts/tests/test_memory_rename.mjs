/* 共享记忆改名：`.learning/MEMORY.md` → `.learning/MEMORY.yaml`（#189）
   ────────────────────────────────────────────────────────────────────────
   改名破的是 [ADR-0004](../../docs/adr/0004-学习数据格式冻结与例外.md) 那句「布局、文件名
   与目录结构不动」的字面承诺，边界与被否备选记在 [ADR-0014](../../docs/adr/0014-共享记忆改名MEMORY.yaml.md)。
   这张票交付的不是新功能，而是「改名不炸任何一处」被证明。这份套件钉住其中**静态**的两条：

     1. **模板骨架**：`templates/MEMORY.yaml` 是带注释的**空**骨架，节与改名前一致；
        旧模板名不许还在盘上。
     2. **全仓没有一处手写的旧名**：`MEMORY.md` 不许再出现在活文件里。旧名从此就是一份
        普通文件——「认新名、不认旧名」的行为判据在各消费点自己的套件里：
        `test_watch_notice`（认域）、`test_host_ask_session`（答疑注入）、
        `test_tools_context`（摘要工具）、`test_host_library_payload`（图片库载荷）。

   为什么豁免名单只有那几张：判据扫的是**手写的**文本，所以豁免只给「性质上不受这条约束」
   的文件——生成产物（CHANGELOG 由发布流程生成，CONTRIBUTING 明写不要手改）、决策记录
   （ADR 必须同时写出旧名与新名，才记得下这次改名）、以及自述为历史/当轮快照的文档。
   豁免不是「跑不过就加一行」：每一条都写得出理由，加之前先问它是不是活文件。

   这条判据的价值就是它的**否定式**：规则可达性套件（`test_skill_rules.mjs`）只断「必须出现」，
   钉不住「不许再出现」，于是改名这类横扫最容易留下半处旧名——某份夹具、某条注释、某个
   模板说明表里的旧路径——而且处处都还是绿的。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseYaml } from '../../lib/yaml.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const OLD_NAME = 'MEMORY.md';
const NEW_NAME = 'MEMORY.yaml';

/* ── 一、模板骨架：新名在、旧名不在，节与今天一致 ─────────────────────────── */

/** 改名前 `templates/MEMORY.md` 的四节与每节的条目（逐字取自那份文件）。
    期望值写死在这里，不从模板自己算——从模板算出来的期望值只能证明它等于它自己。 */
const SKELETON = {
  我是谁: ['现有技能', '各领域当前水平'],
  教学偏好: ['有效的讲法', '容易烦躁的', '例子偏好'],
  学习习惯: ['可投入时间', '节奏', '常见卡点'],
  跨科目观察: [],
};

test('#189 模板：templates/MEMORY.yaml 在盘上，旧模板名不在', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'templates', NEW_NAME)), true,
    `templates/${NEW_NAME} 不在盘上——首次初始化工作区就没有骨架可套`);
  assert.equal(fs.existsSync(path.join(ROOT, 'templates', OLD_NAME)), false,
    `templates/${OLD_NAME} 还留在盘上：改名之后它不该再有第二份（读侧不兜旧名，留着只会误导）`);
});

test('#189 模板：带注释的空骨架，节与四节条目与改名前一致', () => {
  const text = fs.readFileSync(path.join(ROOT, 'templates', NEW_NAME), 'utf8');
  assert.match(text, /^#/m, '骨架要带注释：节是什么、往里写什么，注释是它唯一的说明书');
  assert.doesNotMatch(text, new RegExp(OLD_NAME.replace('.', '\\.')), '骨架里不许再写旧名');

  const parsed = parseYaml(text, { file: `templates/${NEW_NAME}` });
  assert.equal(typeof parsed, 'object', '骨架要解析得开（它是 YAML，不是随手写的文本）');
  assert.deepEqual(Object.keys(parsed), Object.keys(SKELETON), '四节的节名与顺序都要与改名前一致');

  for (const [section, entries] of Object.entries(SKELETON)) {
    const value = parsed[section];
    if (entries.length === 0) {
      // 「跨科目观察」今天的条目没有小标题，就是一串自由记录
      assert.deepEqual(value, [], `「${section}」要是一个空列表（骨架是空的）`);
      continue;
    }
    assert.deepEqual(Object.keys(value), entries, `「${section}」下的条目标题与改名前一致`);
    for (const entry of entries) {
      assert.deepEqual(value[entry], [], `「${section} → ${entry}」要是空的：模板只给形状，不留占位内容`);
    }
  }
});

/* ── 二、全仓没有一处手写的旧名 ───────────────────────────────────────────── */

/** 豁免文件：生成产物、自述历史、以及几条**故意**把旧名当输入的反证。活文件一律不豁免。 */
const EXEMPT_FILES = new Map([
  ['CHANGELOG.md', '发布流程生成的历史记录（CONTRIBUTING 明写不要手改）'],
  ['docs/设计/设计方案.md', '自述「历史文档、不要据此实现」；test_docs_references.mjs 的 HISTORICAL 名单里'],
  ['docs/设计/learning-discovery-validation.md', '自述「当时那次」验收记录的快照，口径按当时的仓库状态写'],
  // 下面三条要把旧名**喂进去**才钉得住「旧名不再被认成记忆」——它们提旧名是故意的，
  // 而且只出现在反证输入那几行。这不是漏洞：除了这三条，别的活文件一个字都不许有。
  ['scripts/tests/test_memory_rename.mjs', '这条判据本身要把旧名当搜索针'],
  ['scripts/tests/test_watch_notice.mjs', '反证输入：旧名要落回普通文件（`workspace` 域）'],
  ['scripts/tests/test_host_ask_session.mjs', '反证输入：只有旧名那份文件时不该注入'],
]);

/** 豁免目录：决策记录。得同时写出旧名与新名，才记得下「从哪个名字改成哪个名字」。 */
const EXEMPT_DIRS = new Map([
  ['docs/adr', '决策记录必须能同时写出旧名与新名'],
]);

/** 不进去的目录：不是本仓的内容（`.git`）或不是手写的（依赖安装目录）。 */
const SKIP_DIRS = new Set(['.git', 'node_modules']);

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const relative = path.relative(ROOT, path.join(dir, entry.name)).split(path.sep).join('/');
      if (EXEMPT_DIRS.has(relative)) continue;
      walk(path.join(dir, entry.name), found);
      continue;
    }
    if (!entry.isFile()) continue;
    found.push(path.relative(ROOT, path.join(dir, entry.name)).split(path.sep).join('/'));
  }
  return found;
}

/** 二进制按扩展名跳过：图是导出的产物（改它的源，不改它），源码与文档都是文本。 */
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.zip', '.pdf']);

test('#189 全仓没有一处手写的旧名（生成产物、决策记录、自述历史与反证输入除外）', () => {
  const offenders = [];
  for (const relative of walk(ROOT)) {
    if (EXEMPT_FILES.has(relative)) continue;
    if (BINARY_EXT.has(path.extname(relative).toLowerCase())) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    } catch {
      continue; // 读不出文本（二进制、坏链接）就不是「手写的旧名」
    }
    if (text.includes('\0')) continue;
    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
      if (line.includes(OLD_NAME)) offenders.push(`${relative}:${index + 1}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, [],
    `这些地方还写着旧名 ${OLD_NAME}——改名波及的每一处都要跟着走：\n${offenders.join('\n')}`);
});
