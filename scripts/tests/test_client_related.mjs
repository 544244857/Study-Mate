/* 「相关课件」（`::: related`）的链接该往哪去（#202）· 判据 + 渲染出来的元素形状
   ────────────────────────────────────────────────────────────────────────────────
   病根：阅读端把课件正文里的 `[文字](目标)` **一律**按外链渲染（新窗口打开），而 `related`
   的条目本来就写成 `- [标题](链接)`，格式规范 §4 给的例子还是**相对路径**（形如
   `0004-cpp.float`）——学生点下去是死页。维护者拍板的方向：只让 `related` 这一种跳转生效
   （正文里的普通链接照旧不管，那里本来也不该出现仓库内路径）。

   三件事要在这条套件里钉住（真浏览器里点一下那一条在 browser/related_links_test.mjs）：
     1. **判据**：什么算「本科目里的另一课」。外链与页内锚点保持原样（一个字不改），
        `<序号>-<节点id>` 的三种写法（裸的 / 带 `lessons/` 前缀 / 带 `.md`）都认，
        其余一律不认。
     2. **比不中不画成链接**：序号或节点 id 对不上、那一课还没有课件正文、跨科目——
        一律留纯文字。渲染成 `<a>` 就是一个点了没反应的新窗口，比不能点更坏。
     3. **站内那一支不开新窗口**：它是 `<button data-node>`（点了走既有的 `openLesson`），
        没有 `href`、没有 `target="_blank"`；外链那一支仍然是 `target="_blank"` 的 `<a>`。

   怎么拿到工厂里的东西：`lib/client.js` 零构建、没有 export，判据与渲染函数都活在工厂闭包里
   ——走 `fixtures/client_harness.mjs` 那条共用的内部件钩子（与 test_client_lab_run.mjs 同一套口径）。
   数据现造现弃。 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { clientInternals, findByProp, viewText } from './fixtures/client_harness.mjs';

const { relatedTarget, relatedIsExternal, Block } = clientInternals();

/* ── 判据 ──────────────────────────────────────────────────────────────── */

/** 一份大纲：0004 与 0012 有课件正文，0005 只有节点、课件还没写。 */
const NODES = [
  { id: 'cpp.float', number: '0004', title: '浮点与精度', lesson_md: '---\ntitle: 浮点\n---\n\n正文\n' },
  { id: 'cpp.int', number: '0005', title: '整数', lesson_md: '' },
  { id: 'cpp.pointer', number: '12', title: '指针', lesson_md: '# 指针\n' },
];

const target = (href, nodes = NODES) => ({ ...relatedTarget(href, nodes) });

test('外链与页内锚点保持外链行为：一个字不改', () => {
  for (const href of [
    'https://oi-wiki.org/lang/branch/',
    'http://example.com/x',
    'mailto:someone@example.com',
    '#小结',
    '//cdn.example.com/a.png',
  ]) {
    assert.deepEqual(target(href), { kind: 'external' }, `${href} 应当按外链处理`);
    assert.equal(relatedIsExternal(href), true, `${href} 应当被判成外链`);
  }
});

test('本科目里的另一课：三种写法都认（序号补不补零都算同一课）', () => {
  for (const href of [
    '0004-cpp.float',            // 规范 §4 例子里的裸写法
    '0004-cpp.float.md',         // 带后缀
    'lessons/0004-cpp.float',    // 带 lessons/ 前缀
    'lessons/0004-cpp.float.md', // 两个都带
    './0004-cpp.float',          // `./` 这种手滑
    '4-cpp.float',               // 文件没补零：还是那一课
  ]) {
    assert.deepEqual(target(href), { kind: 'lesson', id: 'cpp.float' }, `${href} 应当认成 cpp.float 那一课`);
    assert.equal(relatedIsExternal(href), false, `${href} 不是外链`);
  }
  // 两位数序号、`.md` 大小写各一遍：判据不靠固定宽度
  assert.deepEqual(target('12-cpp.pointer'), { kind: 'lesson', id: 'cpp.pointer' });
  assert.deepEqual(target('0004-cpp.float.MD'), { kind: 'lesson', id: 'cpp.float' });
});

test('比不中就落到 missing（渲染成纯文字，不是死链）', () => {
  for (const href of [
    '0009-cpp.float',            // 序号对不上：大纲里 0004 才是浮点
    '0004-cpp.pointer',          // 序号与 id 拼错了
    '0004-nope',                 // 这一科目没有这个节点
    '0005-cpp.int',              // 节点在，但课件正文还没写（点进去只有一句「还没有课件内容文件」）
    '0004-cpp.float/extra',      // 比「一课的写法」更深一层
    '0004-cpp.float.md#小结',    // 课内锚点不是这里认的写法
    'notes/0004-cpp.float',      // 只认 lessons/，别的目录不算
    'README.md',                 // 普通文件名
    '',                          // 空目标
  ]) {
    assert.deepEqual(target(href), { kind: 'missing' }, `${href} 不该被认成能点的一课`);
  }
});

test('跨科目也落在 missing：本科目的大纲里没有它', () => {
  assert.deepEqual(target('0004-other.subject'), { kind: 'missing' });
  assert.deepEqual(target('0004-cpp.float', []), { kind: 'missing' }, '大纲是空的就没有一课比得中');
  assert.deepEqual(target('0004-cpp.float', null), { kind: 'missing' }, '没有大纲也不能抛');
});

/* ── 渲染出来的元素形状 ─────────────────────────────────────────────────── */

/** 树里所有 `type === tag` 的元素（桩的 createElement 把子元素放在 `children`，也认 props.children）。 */
function elements(node, tag, found = [], seen = new Set()) {
  if (node === null || node === undefined || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) elements(item, tag, found, seen);
    return found;
  }
  if (seen.has(node)) return found;
  seen.add(node);
  if (node.type === tag) found.push(node);
  if ('children' in node) elements(node.children, tag, found, seen);
  if (node.props && node.props.children !== undefined) elements(node.props.children, tag, found, seen);
  return found;
}

/** 一份四条的 `related`：站内一课 / 外链 / 写错的相对路径 / 没有链接的条目。 */
const BLOCK = {
  type: 'related',
  items: [
    { text: '上节课：浮点与精度', href: 'lessons/0004-cpp.float', note: '' },
    { text: 'OI Wiki · 分支', href: 'https://oi-wiki.org/lang/branch/', note: '' },
    { text: '写错的那一条', href: '0009-cpp.float', note: '' },
    { text: '没有链接的条目', href: '', note: '' },
  ],
};

const ctxWith = (open) => ({
  subject: { slug: 'demo', name: '演示科目', nodes: NODES },
  node: NODES[0],
  assetBase: '',
  renderAnchor: null,
  openLesson: open,
});

test('站内那一课渲染成按钮：没有 href / target，点了走 openLesson 且只走一次', () => {
  const opened = [];
  const tree = Block({ block: BLOCK, ctx: ctxWith((id) => opened.push(id)) });

  const buttons = elements(tree, 'button');
  assert.equal(buttons.length, 1, '四条里只有一条是站内的一课：按钮也应当只有一颗');
  const [button] = buttons;
  assert.equal(button.props.type, 'button');
  assert.equal(button.props['data-node'], 'cpp.float', '按钮要指到那一课的节点 id');
  assert.equal(button.props.href, undefined, '站内跳转不该带 href（它没有被打开的地址）');
  assert.equal(button.props.target, undefined, '站内跳转不许开新窗口');
  assert.equal(button.props.className, 'smb-related__link', '观感靠这个类名，别让它悄悄消失');
  assert.match(String(button.props.className), /smb-related__link/);

  assert.deepEqual(opened, [], '渲染这一步不许自己打开课——只有点了才跳');
  button.props.onClick();
  assert.deepEqual(opened, ['cpp.float']);
});

test('外链那条照旧：target="_blank" + rel="noreferrer" 的 <a>', () => {
  const tree = Block({ block: BLOCK, ctx: ctxWith(() => {}) });
  const anchors = elements(tree, 'a');
  assert.equal(anchors.length, 1, '四条里只有一条是外链：<a> 也应当只有一个');
  const [anchor] = anchors;
  assert.equal(anchor.props.href, 'https://oi-wiki.org/lang/branch/');
  assert.equal(anchor.props.target, '_blank', '外链照旧开新窗口（这条不是这张票要改的）');
  assert.equal(anchor.props.rel, 'noreferrer');
});

test('比不中与没有链接的条目：一句话都不少，但都不是链接', () => {
  const tree = Block({ block: BLOCK, ctx: ctxWith(() => {}) });
  const text = viewText(tree).replace(/\s+/g, ' ');
  for (const label of ['上节课：浮点与精度', 'OI Wiki · 分支', '写错的那一条', '没有链接的条目']) {
    assert.ok(text.includes(label), `「${label}」应当还在页面上：${text}`);
  }
  // 写错的那一条与没有链接的那一条：不属于任何 <a> / <button>（树里只有上面那两颗）
  assert.equal(elements(tree, 'button').length, 1);
  assert.equal(elements(tree, 'a').length, 1);
  assert.equal(findByProp(tree, 'href', '0009-cpp.float').length, 0, '写错的相对路径不许渲染成链接');
});

test('拿不到 openLesson 时站内那一课退成纯文字（不能开就别画成链接）', () => {
  for (const ctx of [{}, { subject: { slug: 'demo', nodes: NODES } }]) {
    const tree = Block({ block: BLOCK, ctx });
    assert.equal(elements(tree, 'button').length, 0, '没有打开路径就一颗按钮都不该有');
    assert.equal(elements(tree, 'a').length, 1, '外链不受影响');
    assert.ok(viewText(tree).includes('上节课：浮点与精度'), '文字还在，只是不能点');
  }
});
