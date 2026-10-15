/* 共享记忆改名：`.learning/MEMORY.md` → `.learning/MEMORY.yaml`（#189）
   ────────────────────────────────────────────────────────────────────────
   改名破的是 [ADR-0004](../../docs/adr/0004-学习数据格式冻结与例外.md) 那句「布局、文件名
   与目录结构不动」的字面承诺，边界与被否备选记在 [ADR-0014](../../docs/adr/0014-共享记忆改名MEMORY.yaml.md)。
   这张票交付的不是新功能，而是「改名不炸任何一处」被证明。这份套件钉住其中**静态**的两条：

     1. **模板骨架**：`templates/MEMORY.yaml` 是带注释的**空**骨架，节与改名前一致；
        旧模板名不许还在盘上。
     2. **已跟踪文件里没有一处手写的旧名**：`MEMORY.md` 不许再出现在本仓的活文件里。
        旧名从此就是一份普通文件——「认新名、不认旧名」的行为判据在各消费点自己的套件里：
        `test_watch_notice`（认域）、`test_host_ask_session`（答疑注入）、
        `test_tools_context`（摘要工具）、`test_host_library_payload`（图片库载荷）。

   判据扫的是**已跟踪文件**（`git ls-files`），不是「工作区里所有文件」。这一条是踩过坑的：
   开发机上总躺着未跟踪或被 ignore 的东西——本地 scratch（`.superpowers/`）、维护者真实的
   学习工作区（`workspace/`）、一次性分析产物（`分析/`）——它们不是本仓的内容。对它们敏感
   意味着这条门禁在本地永远红，而 CI 是干净检出、看不见这些残留：同一个判据两边给出不同
   结论，等于把「本地 `npm test` 跑通」这条唯一的门禁废掉（CONTRIBUTING 硬规矩 3），
   还正好撞上「测试不读写学生的 `workspace/`」那条规矩。
   也不用一份手写的目录黑名单：那会随仓库长大而腐烂，还容易把真 offender 一起放过；
   `git ls-files` 是仓库自己算出来的，本地与 CI 看到的是同一个集合。

   为什么豁免名单只有那几张：判据扫的是**手写的**文本，所以豁免只给「性质上不受这条约束」
   的文件——生成产物（CHANGELOG 由发布流程生成，CONTRIBUTING 明写不要手改）、决策记录
   （ADR 必须同时写出旧名与新名，才记得下这次改名）、以及自述为历史/当轮快照的文档。
   豁免不是「跑不过就加一行」：每一条都写得出理由，加之前先问它是不是活文件。

   这条判据的价值就是它的**否定式**：规则可达性套件（`test_skill_rules.mjs`）只断「必须出现」，
   钉不住「不许再出现」，于是改名这类横扫最容易留下半处旧名——某份夹具、某条注释、某个
   模板说明表里的旧路径——而且处处都还是绿的。判据自己不空转由下面两条**合成数据自证**钉住：
   喂一个带旧名的**已跟踪**样本进去必须报出来，未跟踪与被 ignore 的必须不报
   （同一条纪律的先例：`scripts/release/checks.mjs` 的自检、`test_architecture_boundaries.mjs`
   的合成图反证）。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
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

/* ── 二、已跟踪文件里没有一处手写的旧名 ───────────────────────────────────── */

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

function isExempt(relative) {
  if (EXEMPT_FILES.has(relative)) return true;
  for (const dir of EXEMPT_DIRS.keys()) {
    if (relative === dir || relative.startsWith(`${dir}/`)) return true;
  }
  return false;
}

/** 二进制按扩展名跳过：图是导出的产物（改它的源，不改它），源码与文档都是文本。 */
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.zip', '.pdf']);

/** `git` 在这个目录里起得来吗。起不来（没装 git）时判据明确跳过，不静默算通过。 */
function gitRun(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
}

function gitAvailable() {
  const probe = gitRun(ROOT, ['--version']);
  return !probe.error && probe.status === 0;
}

function isGitRepo(root) {
  const probe = gitRun(root, ['rev-parse', '--git-dir']);
  return !probe.error && probe.status === 0;
}

/** 仓库里**已跟踪**的文件（相对仓库根）。未跟踪与被 ignore 的一律不在里面——
    这就是「本机的 scratch 与学习工作区不影响这条门禁」的判据本体。 */
function trackedFiles(root) {
  const listed = gitRun(root, ['ls-files', '-z']);
  if (listed.error || listed.status !== 0) {
    throw new Error(`读不到已跟踪文件清单（\`git ls-files\`）：${listed.error?.message ?? String(listed.stderr).trim()}`);
  }
  // `-z` 不只是分隔符：默认设置下 git 会把非 ASCII 路径转义成 `"\346…"`，那不是盘上的路径
  return String(listed.stdout).split('\0').filter((entry) => entry !== '');
}

/** 这些文件里的旧名：`{ file, line, text }` 列表。同一段代码既扫真仓库、也扫合成样本。 */
function oldNameOffenders(files, root) {
  const offenders = [];
  for (const relative of files) {
    if (isExempt(relative)) continue;
    if (BINARY_EXT.has(path.extname(relative).toLowerCase())) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(root, relative), 'utf8');
    } catch {
      continue; // 已跟踪但读不到（删了没提交）：那不是一个手写的旧名
    }
    if (text.includes('\0')) continue;
    for (const [index, line] of text.split('\n').entries()) {
      if (line.includes(OLD_NAME)) offenders.push({ file: relative, line: index + 1, text: line.trim() });
    }
  }
  return offenders;
}

/** 合成样本：三份文件里都写着旧名，只有一份进了索引。
    判据的输入是索引，所以那一份必须报出来、另外两份必须不报——两条自证共用它。 */
function syntheticRepo(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'studymate-rename-probe-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\n');
  fs.writeFileSync(path.join(root, 'clean.md'), '这一份是干净的，一个字都不提那个名字\n');
  fs.mkdirSync(path.join(root, 'tracked'), { recursive: true });
  fs.mkdirSync(path.join(root, 'untracked'), { recursive: true });
  fs.mkdirSync(path.join(root, 'ignored'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tracked', '旧名.md'), `第一行\n这里写着 ${OLD_NAME}\n`);
  fs.writeFileSync(path.join(root, 'untracked', '也好旧.md'), `${OLD_NAME}\n`);
  fs.writeFileSync(path.join(root, 'ignored', 'scratch.md'), `${OLD_NAME}\n`);

  assert.equal(gitRun(root, ['init', '-q']).status, 0, '合成样本要一个真 git 仓库：判据的输入就是索引');
  // 只把该跟踪的加进索引：`untracked/` 留在索引外，`ignored/` 被 .gitignore 挡住
  assert.equal(gitRun(root, ['add', '--', 'tracked', 'clean.md', '.gitignore']).status, 0, '加不进索引就证不了这条');
  return root;
}

const SAMPLES = ['tracked/旧名.md', 'untracked/也好旧.md', 'ignored/scratch.md'];

test('#189 判据不空转：已跟踪文件里的旧名必须被列成 offender', (t) => {
  if (!gitAvailable()) { t.skip('这台机器上没有 git'); return; }
  const root = syntheticRepo(t);
  const files = trackedFiles(root);
  assert.ok(files.includes('tracked/旧名.md'), `已跟踪清单里没有那份样本：${JSON.stringify(files)}`);

  const offenders = oldNameOffenders(files, root);
  assert.deepEqual(offenders.map((one) => one.file), ['tracked/旧名.md'],
    '合成样本里那份已跟踪的旧名没被列出来——这条判据空转了');
  assert.equal(offenders[0].line, 2, '行号要指到写着旧名的那一行');
  assert.match(offenders[0].text, /这里写着/, '报出来的该是那一行的原文');
});

test('#189 判据只认已跟踪文件：未跟踪与被 ignore 的路径一条都不进 offender', (t) => {
  if (!gitAvailable()) { t.skip('这台机器上没有 git'); return; }
  const root = syntheticRepo(t);
  // 盘上确实有三份写着旧名：不这么钉一下，「一个都没报」也能被读成判据是对的
  for (const relative of SAMPLES) {
    assert.match(fs.readFileSync(path.join(root, relative), 'utf8'), /MEMORY\.md/, `${relative} 该是被造出来的`);
  }

  const files = trackedFiles(root);
  assert.deepEqual(files.filter((one) => one.startsWith('untracked/') || one.startsWith('ignored/')), [],
    '未跟踪与被 ignore 的路径不该进清单：本机 scratch 与维护者的 `workspace/` 会让门禁在本地永远红');
  assert.deepEqual(oldNameOffenders(files, root).map((one) => one.file), ['tracked/旧名.md'],
    '只有已跟踪的那一份算违规');
});

test('#189 已跟踪文件里没有一处手写的旧名（生成产物、决策记录、自述历史与反证输入除外）', (t) => {
  if (!isGitRepo(ROOT)) { t.skip('不是 git 仓库（npm 安装副本），跳过'); return; }
  const files = trackedFiles(ROOT);
  assert.ok(files.length > 100, `已跟踪文件清单只有 ${files.length} 份，不像这个仓库——判据会空转`);

  const offenders = oldNameOffenders(files, ROOT);
  assert.deepEqual(offenders.map((one) => `${one.file}:${one.line}: ${one.text}`), [],
    `这些地方还写着旧名 ${OLD_NAME}——改名波及的每一处都要跟着走：\n`
    + offenders.map((one) => `${one.file}:${one.line}: ${one.text}`).join('\n'));
});
