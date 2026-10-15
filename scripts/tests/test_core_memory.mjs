/* 纯函数域 · 记忆模块（`lib/core/memory.ts`，#190）
   ────────────────────────────────────────────────────────────────────────
   这条套件钉的是**注入边界**：喂两份记忆文件的文本（或「文件不存在」），看模块给出什么。
   「画像三节进上下文、`积累` 与整份科目记忆一个字都不进」不能只靠提示词约定，所以这条
   边界在这里被钉成判据——喂一份带 `积累` 的记忆，投影里它一个字都不能出现。

   测的是外部行为：投影文本、节名判定、`积累` 条目的键与内容。不 assert 内部函数与私有
   结构——换实现照样该过。数据全部**现造**（内联字符串），不读仓库里任何文件、不落盘；
   唯一的例外是对着真模板 `templates/MEMORY.yaml` 跑一遍（骨架必须解析得开、四个节名齐全、
   一条内容都没有），那是 #189 落地的那份骨架与这张票的节名对账。

   为什么「一条内容都没有」要单独判：预置的空骨架是**正常状态**（新工作区就是这样），
   空的画像不该被注入成一堆空壳——注入的门槛是「画像三节里有内容」，不是「文件存在」。
   ──────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  ACCUMULATION_SECTION, MEMORY_FILE, MEMORY_SECTIONS, PROFILE_SECTIONS, readMemory, readMemoryFile,
} from '../../lib/core/memory.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/* ── 夹具：一份像样的共享记忆 ───────────────────────────────────────────── */

/** 画像三节各有一条内容 + `积累` 一条。`积累` 里的用词（`fish 脾气`）在三节里一次都不出现，
    所以「投影里没有它」这条断言不会因为共用词而假阳性。 */
const SHARED = [
  '# 学习者记忆 —— 跨科目、跨会话的共享记忆。',
  '#',
  '# 这一整段注释都在第一个节名之前，不属于任何一节。',
  '',
  '我是谁:',
  '  现有技能: [终端]',
  '',
  '教学偏好:',
  '  有效的讲法: 先给结论再给为什么。',
  '',
  '学习习惯:',
  '  常见卡点: []',
  '',
  '积累:',
  '  fish 脾气: 这台机器上 fish 不吃双横线。',
  '',
].join('\n');

/** 手写的期望值（不从模块算）：画像三节里**有内容**的那两节，按白名单顺序原样接起来。
    「学习习惯」只有一条空列表 `[]`——它算「这一节还没内容」，不进投影。 */
const SHARED_PROJECTION = [
  '我是谁:',
  '  现有技能: [终端]',
  '',
  '教学偏好:',
  '  有效的讲法: 先给结论再给为什么。',
].join('\n');

test('#190 投影：只给画像三节里有内容的那几节，`积累` 一个字都不进', () => {
  const report = readMemory({ shared: SHARED });

  assert.equal(report.injectable, SHARED_PROJECTION);
  assert.equal(report.injectable, report.shared.injectable, '顶层投影就是共享记忆那一份');
  // 否定式断言：`积累` 的节名、键、内容一个都不许出现
  for (const fragment of [ACCUMULATION_SECTION, 'fish 脾气', '不吃双横线']) {
    assert.equal(report.injectable.includes(fragment), false,
      `投影里出现了「${fragment}」：${JSON.stringify(report.injectable)}`);
  }
});

/* ── 节名与骨架 ─────────────────────────────────────────────────────────── */

test('#190 分节：节名、顺序、行号范围与「这一节有没有内容」', () => {
  const view = readMemoryFile('shared', SHARED);

  assert.equal(view.present, true);
  assert.deepEqual(view.sections.map((section) => section.heading),
    ['我是谁', '教学偏好', '学习习惯', ACCUMULATION_SECTION]);
  assert.deepEqual(view.missing, [], '四个节名齐全');
  assert.deepEqual(view.unknown, [], '没有规范之外的节');
  assert.equal(view.empty, false);

  const [who, teach, habit] = view.sections;
  assert.equal(who.from, 5, '`我是谁:` 在第 5 行（1 起，与校验器的 line 口径一致）');
  assert.equal(who.to, 7, '到下一节标题之前那一行（含）');
  assert.deepEqual(who.entries.map((entry) => entry.key), ['现有技能']);
  assert.equal(habit.entries.length, 0, '`常见卡点: []` 是「还没有条目」，不是一条内容');
  assert.equal(teach.entries[0].content, '先给结论再给为什么。');
  assert.equal(teach.entries[0].line, 9);
});

test('#190 缺节与多余节：两个方向都报出来，规范顺序说了算', () => {
  const view = readMemoryFile('shared', ['我是谁:', '  现有技能: [终端]', '', '旧节:', '  - 一条', ''].join('\n'));

  assert.deepEqual(view.missing, ['教学偏好', '学习习惯', ACCUMULATION_SECTION]);
  assert.deepEqual(view.unknown, ['旧节'], '规范之外的节名要找得出来（`跨科目观察` 就是这么退休的）');
  assert.equal(view.injectable, '我是谁:\n  现有技能: [终端]');
});

test('#190 缺文件：不是错误——present:false，缺的节是全部', () => {
  const absent = readMemory({});
  assert.equal(absent.shared.present, false);
  assert.equal(absent.subject.present, false);
  assert.deepEqual(absent.shared.missing, [...MEMORY_SECTIONS.shared]);
  assert.deepEqual(absent.subject.missing, [...MEMORY_SECTIONS.subject]);
  assert.equal(absent.injectable, '', '没有记忆就没有可注入的东西');
  assert.equal(absent.empty, true);
  // 读不到与「读到了但是空的」要分得开：总控照着 present 说话，不照着投影空不空说话
  const blank = readMemory({ shared: '' });
  assert.equal(blank.shared.present, true);
  assert.equal(blank.shared.empty, true);
});

test('#190 空骨架不注入：模板那份骨架解析得开、四节齐全、一条内容都没有', () => {
  const template = fs.readFileSync(path.join(ROOT, 'templates', MEMORY_FILE), 'utf8');
  const view = readMemoryFile('shared', template);

  assert.equal(view.present, true);
  assert.deepEqual(view.sections.map((section) => section.heading), [...MEMORY_SECTIONS.shared],
    '预置骨架的节名与顺序就是规范顺序');
  assert.deepEqual(view.missing, []);
  assert.deepEqual(view.unknown, [], '`跨科目观察` 这个节名不许还在骨架里');
  assert.equal(view.empty, true, '骨架是空的：注释与空列表都不算内容');
  assert.equal(view.injectable, '', '空骨架注入进去只是一堆空壳，等于没注入');
});

/* ── `积累` 条目：键与内容 ──────────────────────────────────────────────── */

test('#190 积累条目：键 + 一句话，取自键下面那一行（多行/列表都收）', () => {
  const text = [
    '教学偏好:',
    '  有效的讲法: 先给结论。',
    '',
    '积累:',
    '  探针结论: 这台机器上 fish 不吃双横线。',
    '  查手册:',
    '    - 用 man -k 查。',
    '    - 中文页要 man -LC_ALL=zh_CN。',
    '  空的: []',
    '',
  ].join('\n');

  const report = readMemory({ shared: text });
  assert.deepEqual(report.accumulations.map((entry) => [entry.key, entry.content]), [
    ['探针结论', '这台机器上 fish 不吃双横线。'],
    ['查手册', '用 man -k 查。\n中文页要 man -LC_ALL=zh_CN。'],
  ], '空的那一条不算条目——`积累` 里没有内容就没有这一条');
  assert.deepEqual(report.accumulations.map((entry) => entry.from), ['shared', 'shared']);
  assert.equal(report.accumulations[1].line, 6, '行号指到键那一行');
});

test('#190 科目记忆：一节都不进上下文，但它的 `积累` 条目照读', () => {
  const subject = [
    '# 科目记忆 —— 只对这门课成立的做法与事实。',
    '#',
    '积累:',
    '  演示环境: 这门课的 lab 要在 /tmp 下跑。',
    '',
  ].join('\n');
  const report = readMemory({ shared: SHARED, subject });

  assert.equal(report.subject.present, true);
  assert.deepEqual(report.subject.missing, []);
  assert.equal(report.subject.injectable, '', '科目记忆没有画像三节，整份都不进上下文');
  assert.equal(report.injectable, SHARED_PROJECTION, '顶层投影只由共享记忆的画像三节决定');
  assert.equal(report.injectable.includes('lab'), false);
  assert.deepEqual(report.accumulations.map((entry) => [entry.from, entry.key]), [
    ['shared', 'fish 脾气'],
    ['subject', '演示环境'],
  ], '共享在前、科目在后，各自按文件顺序');
  assert.equal(report.empty, false);
});

test('#190 科目记忆按「只有一节」判：多出来的节名要报出来', () => {
  const view = readMemoryFile('subject', ['我是谁:', '  现有技能: [终端]', '', '积累:', '  一条: 有内容。', ''].join('\n'));
  assert.deepEqual(view.missing, [], '`积累` 在，科目记忆就齐了');
  assert.deepEqual(view.unknown, ['我是谁'], '科目记忆里不该有画像三节——那是共享记忆的位置');
  assert.equal(view.injectable, '');
});

/* ── 科目记忆的骨架（#191）─────────────────────────────────────────────
   目标文件名与共享记忆**一样**（都叫 `MEMORY.yaml`），所以 `templates/` 下的源名必须
   可区分：共享那份占着 `MEMORY.yaml`，科目这份叫 `subject-MEMORY.yaml`。
   判据对着真模板跑：建科目时预置的那份骨架必须解析得开、只有「积累」一节、一条内容都没有
   ——空骨架是**正常状态**（新科目就是这样），不该被当成「有内容可读」或「有东西可注入」。 */

const SUBJECT_TEMPLATE = 'subject-MEMORY.yaml';

test('#191 科目骨架：只有「积累」一节、带注释、一条内容都没有、一个字都不进上下文', () => {
  const file = path.join(ROOT, 'templates', SUBJECT_TEMPLATE);
  assert.equal(fs.existsSync(file), true, `templates/${SUBJECT_TEMPLATE} 不在盘上——建科目时就没有骨架可套`);
  const template = fs.readFileSync(file, 'utf8');
  assert.match(template, /^#/m, '带注释的空骨架是票面要求：角色第一次写就知道该写什么形状');

  const view = readMemoryFile('subject', template);
  assert.equal(view.present, true);
  assert.deepEqual(view.sections.map((section) => section.heading), [...MEMORY_SECTIONS.subject],
    '科目记忆只有「积累」一节（画像三节是共享记忆的位置）');
  assert.deepEqual(view.missing, []);
  assert.deepEqual(view.unknown, []);
  assert.equal(view.empty, true, '骨架是空的：注释与空映射都不算内容');
  assert.equal(view.injectable, '', '整份科目记忆都不进上下文');
  assert.deepEqual(view.accumulations, [], '空骨架里一条 `积累` 都没有');

  // 源名要登记在给人看的说明表里，且写清它落到工作区的哪一处
  const readme = fs.readFileSync(path.join(ROOT, 'templates', 'README.md'), 'utf8');
  assert.ok(readme.includes(SUBJECT_TEMPLATE), 'templates/README.md 要登记科目骨架的源名');
  assert.ok(readme.includes('.learning/subjects/<slug>/MEMORY.yaml'), '登记表要写清它落到科目目录下');
});

test('#191 科目骨架：填上一条「键 + 一句话」就按科目记忆读出来（from 是 subject），仍不进注入', () => {
  const template = fs.readFileSync(path.join(ROOT, 'templates', SUBJECT_TEMPLATE), 'utf8');
  // 骨架里 `积累: {}` 是「这一节还没有条目」；角色就是这么往里加一条的
  const filled = template.replace(/^积累: \{\}$/m, [
    '积累:',
    '  探针结论: 这门课的 lab 要在 /tmp 下跑。',
  ].join('\n'));
  assert.notEqual(filled, template, '骨架里该有一个空的 `积累: {}` 供替换');

  const report = readMemory({ subject: filled });
  assert.deepEqual(report.subject.missing, []);
  // 期望行号自己数一遍（不从模块算）：角色 grep 到的键在第几行，回报里就得是第几行
  const line = filled.split('\n').findIndex((one) => one.includes('探针结论')) + 1;
  assert.deepEqual(report.accumulations, [
    { key: '探针结论', content: '这门课的 lab 要在 /tmp 下跑。', from: 'subject', line },
  ], '科目记忆的键与内容读得出来（角色干活要 grep 键），出处是 subject');
  assert.equal(report.subject.empty, false, '填过一条就不是空骨架了');
  assert.equal(report.injectable, '', '共享记忆不在场：没有可注入的东西');
  assert.equal(report.subject.injectable, '');
  assert.equal(report.injectable.includes('探针结论'), false);
  assert.equal(report.injectable.includes('/tmp'), false);
});

test('#191 科目记忆缺「积累」一节：报出来，不是静默当空', () => {
  const view = readMemoryFile('subject', ['# 一份只有注释的科目记忆', '', '# 什么都没有', ''].join('\n'));

  assert.equal(view.present, true, '文件在盘上');
  assert.deepEqual(view.sections, [], '一个节都没有');
  assert.deepEqual(view.missing, [...MEMORY_SECTIONS.subject], '规范里该有的节名要交代清楚');
  assert.equal(view.empty, true);
  assert.equal(view.injectable, '');
});

/* ── 边界：手写 YAML 的几种常见写法 ─────────────────────────────────────── */

test('#190 边界：引号键、列表值、块标量与三种空值写法都收得住', () => {
  const text = [
    "'我是谁':",  // 单引号包着的键
    '  各领域当前水平:',
    '    - 入门',
    '  现有技能: null',
    '  常用工具: ~',
    '',
    '"教学偏好":',  // 双引号包着的键
    '  有效的讲法: |-',
    '    先给结论，',
    '    再给为什么。',
    "  例子偏好: ''",
    '',
    '积累:',
    '  一条散文: >',
    '    这台机器的 fish 不吃双横线，',
    '    别在函数里用。',
    '',
  ].join('\n');
  const report = readMemory({ shared: text });

  assert.deepEqual(report.shared.sections.map((section) => section.heading),
    ['我是谁', '教学偏好', ACCUMULATION_SECTION], '引号包着的键也是节名');
  assert.deepEqual(report.shared.unknown, []);
  assert.equal(report.shared.empty, false);
  assert.deepEqual(report.shared.sections[0].entries.map((entry) => [entry.key, entry.content]),
    [['各领域当前水平', '入门']], '`null` 与 `~` 是「还没有内容」，不算一条');
  assert.deepEqual(report.shared.sections[1].entries.map((entry) => [entry.key, entry.content]), [
    ['有效的讲法', '先给结论，\n再给为什么。'],
  ], '块标量的引子不是内容，内容在下面那几行；`\'\'` 同样不算一条');
  assert.deepEqual(report.accumulations.map((entry) => [entry.key, entry.content]), [
    ['一条散文', '这台机器的 fish 不吃双横线，\n别在函数里用。'],
  ]);
  assert.match(report.injectable, /先给结论，/, '块标量那一节有内容，就该进投影');
});

test('#190 边界：节里直接写列表项也读得出来（`积累` 里的自由记录）', () => {
  const view = readMemoryFile('shared', ['积累:', '  - 这台机器上 man -k 能用。', ''].join('\n'));

  assert.deepEqual(view.accumulations, [{ key: '', content: '这台机器上 man -k 能用。', line: 2 }],
    '列表项没有键，键就是空串——它照样是一条有内容的条目');
  assert.equal(view.empty, false);
  assert.deepEqual(view.missing, [...MEMORY_SECTIONS.shared].filter((heading) => heading !== ACCUMULATION_SECTION));
  assert.equal(view.injectable, '');
});

test('#190 边界：只有注释的节算空（空骨架的第一种长相）', () => {
  const view = readMemoryFile('shared', ['# 这份文件的分节说明', '我是谁:', '  # 这里写你的技能与水平', ''].join('\n'));

  assert.deepEqual(view.sections.map((section) => section.heading), ['我是谁']);
  assert.equal(view.sections[0].entries.length, 0, '注释是给人看的说明书，不是内容');
  assert.equal(view.empty, true);
  assert.equal(view.injectable, '');
});

test('#190 边界：没写键的整行散文也算一条（学生手写的句子不静默丢）', () => {
  const view = readMemoryFile('shared', ['我是谁:', '  喜欢先动手再补理论。', ''].join('\n'));

  assert.deepEqual(view.sections[0].entries, [{ key: '', content: '喜欢先动手再补理论。', line: 2 }]);
  assert.equal(view.empty, false);
  assert.equal(view.injectable, ['我是谁:', '  喜欢先动手再补理论。'].join('\n'));
});
