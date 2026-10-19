/* 「相关课件」指向本科目另一课：真浏览器里点一下（#202）
   ────────────────────────────────────────────────────────────────────────────────
   这张票要消掉的缺陷：`::: related` 的条目本来就写成 `- [标题](链接)`，格式规范 §4 的例子
   还是相对路径（`0004-cpp.float`），而阅读端把正文里的 `[文字](目标)` **一律**按外链渲染
   （新窗口打开）——学生点下去是一个不存在的新页面。维护者拍板的方向：只让 `related` 这一种
   跳转生效，目标是本科目的另一课时**就地打开**，别开新窗口；比不中就不画成链接。

   为什么必须真浏览器：判据那一半（认哪些写法、比不中怎么降级、渲染成什么元素）在
   `scripts/tests/test_client_related.mjs` 里用 Node 钉住了，但那张票的病根在**点下去之后**：
   要的是「这一页换成了那一课、地址没变、没开新窗口」。那三件事只有真 DOM + 真事件才看得见，
   而 mini-react 的 React 桩连 onClick 都不会自己触发。

   两个场景（每个场景重新导航一次，不带着上一步的状态）：
     · `related-links`：一条 `:::` 块里五种条目各就各位——裸写法与带 `lessons/…md` 的写法是
       站内按钮（没有 href、没有 target）、外链与页内锚点照旧是 `target="_blank"` 的 `<a>`、
       写错的那一条是纯文字。顺带钉住「正文里的普通链接一个字没改」。
     · `related-open`：先点写错的那一条（什么都不该发生），再点站内那一条（这一页换成那一课、
       `location.href` 一字不变、那一课没有 related 块所以按钮不再出现）。

   浏览器二进制由 harness 探测；找不到时明确跳过（退出码 3），不是静默绿。
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readLibrary } from '../../../lib/library.ts';
import { extractCss } from '../fixtures/client-css.mjs';
import { openSession, finishSuite } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

let failures = 0;
function check(label, ok, detail = '') {
  failures += ok ? 0 : 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `  — ${detail}`}`);
}

const TEMPS = [];

/* ── 夹具工作区：现造现弃 ──────────────────────────────────────────────── */

/** 三课：`0001-浮点`（带 related 块，取景主角）、`0002-整数`（跳过去的那一课）、`0003-指针`。 */
function subjectFiles(dirName, { slug, name, touched }) {
  return {
    [`.learning/subjects/${dirName}/subject.yaml`]: [
      `slug: ${slug}`, `name: ${name}`, 'goal: 让「相关课件」真的能点', 'status: 学习中',
      `created_at: "${touched}"`, '',
    ].join('\n'),
    [`.learning/subjects/${dirName}/curriculum.yaml`]: [
      'nodes:',
      '  - id: 浮点', '    title: 浮点与精度', '    kind: 概念', '    objective: 说清浮点是近似值',
      '    status: 学习中',
      '  - id: 整数', '    title: 整数', '    kind: 概念', '    objective: 说清整数是精确的',
      '    prerequisites: [浮点]', '    status: 未开始',
      '  - id: 指针', '    title: 指针', '    kind: 概念', '    objective: 说清指针指向什么',
      '    prerequisites: [整数]', '    status: 未开始',
      '', // 大纲的 edges 可选：这一门只关心节点顺序
    ].join('\n'),
    [`.learning/subjects/${dirName}/progress.yaml`]: [
      `updated_at: "${touched}"`, 'nodes:', '  浮点:', '    status: 学习中', '',
    ].join('\n'),
    // 主角这一课：正文里**两条普通链接**（外链 + 仓库内路径）用来钉「正文那一支一个字没改」；
    // related 块里五种条目把三种去向摆齐。
    [`.learning/subjects/${dirName}/lessons/0001-浮点.md`]: [
      '# 浮点与精度', '',
      '浮点是一串带精度的近似值。正文里也有链接：[外部文档](https://example.com/doc)，',
      '还有一条仓库内路径的 [指针那一课](0003-指针)——正文里的普通链接照旧按外链处理（#202 不动它）。', '',
      '## 小结', '',
      '小结一段，页内锚点就落在这里。', '',
      '::: related',
      '- [整数那一课（裸写法）](0002-整数)',
      '- [整数那一课（带前缀与后缀）](lessons/0002-整数.md)',
      '- [外链 · OI Wiki 分支](https://oi-wiki.org/lang/branch/)',
      '- [页内锚点](#小结)',
      '- [写错的那一条](0009-不存在)',
      ':::', '',
    ].join('\n'),
    // 跳过去的那一课：没有 related 块——切过去之后按钮必须消失（不是画在别处、也不是留着旧的）
    [`.learning/subjects/${dirName}/lessons/0002-整数.md`]: [
      '# 整数', '', '整数是精确的，浮点不是。这一课没有相关课件块。', '',
    ].join('\n'),
    [`.learning/subjects/${dirName}/lessons/0003-指针.md`]: '# 指针\n\n指针是一个地址。\n',
  };
}

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sm-related-'));
  TEMPS.push(root);
  const workspace = path.join(root, 'ws');
  fs.mkdirSync(path.join(workspace, '.learning'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.learning', 'MEMORY.yaml'), '# 共享记忆\n');
  const files = subjectFiles('demo', { slug: 'demo', name: '演示科目', touched: '2026-05-06T07:08:09+08:00' });
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(workspace, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return { root, workspace };
}

/* ── 夹具页（与 reading_routes_test / lesson_body_test 同一套搭法）──────── */

function hostTokenCss() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'fixtures', 'host-theme-tokens.json'), 'utf8'));
  const block = (table) => Object.entries(table).map(([name, value]) => `${name}:${value}`).join(';');
  return [
    `body{${block(snapshot.light)}}`,
    `body[data-ds-dark-theme]{${block(snapshot.dark)}}`,
    'body{background-color:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
  ].join('\n');
}

function buildFixture(dir, payload) {
  const css = extractCss(fs.readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8'));
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>StudyMate「相关课件」QA 夹具</title>
<style>
  html, body { margin: 0; height: 100%; }
  #root { height: 100%; }
  ${hostTokenCss()}
</style>
<style id="plugin-css">${css}</style>
<script>
  window.__StudymateSpec = null;
  window.__ModuleLoader__ = { load: function (spec) { window.__StudymateSpec = spec; } };
  window.__Payload = ${json};
  window.fetch = function (url) {
    if (String(url).indexOf('/api/studymate/library') === 0) {
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(window.__Payload); } });
    }
    return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({ error: '夹具没有这条接口：' + url }); } });
  };
  // 变更推送（#74）那条 EventSource 在 file:// 下注定失败，而推送不在这一面的验收面上：收掉它
  // （lib/client.js 认这个早退）。这条通道由 watch_push_test.mjs 覆盖。
  window.EventSource = undefined;
  // mini-react 每次重渲染整树重建 DOM，被 effect 闭住的旧节点一脱离文档就报 0 宽——于是
  // LessonPage 的 ResizeObserver 会把画布宽量成 0、两条栏永远打不开。垫片只在 observe 时
  // 同步报一次真实尺寸，与真 React 下「只有真的变了才回调」等价（见 reading_routes_test 的长注释）。
  window.ResizeObserver = function (callback) {
    this.observe = function (target) {
      callback([{ target: target, contentRect: target.getBoundingClientRect() }], this);
    };
    this.unobserve = function () {};
    this.disconnect = function () {};
  };
</script>
</head>
<body>
<div id="root"></div>
<script src="${pathToFileURL(path.join(HERE, '..', 'fixtures', 'mini-react.js')).href}"></script>
<script src="${pathToFileURL(path.join(ROOT, 'lib', 'client.js')).href}"></script>
<script>
  (function () {
    var spec = window.__StudymateSpec;
    if (!spec) throw new Error('lib/client.js 没有向 window.__ModuleLoader__ 登记');
    var mod = spec.factory(function (name) { return name === 'react' ? window.MiniReact : undefined; });
    var Main = null;
    mod.apply({
      slots: {
        inject: function (seat, callback) { callback(); },
        register: function (options, component) { if (options && options.name === 'main') Main = component; },
      },
    });
    if (!Main) throw new Error('没有从 main 座位拿到组件');
    window.MiniReact.mount(window.MiniReact.createElement(Main, null), document.getElementById('root'));
  }());
</script>
</body>
</html>
`;
  const file = path.join(dir, 'related-fixture.html');
  fs.writeFileSync(file, html);
  return pathToFileURL(file).href;
}

/* ── 页面里的几步操作与探针（都靠真点击，不碰内部状态） ─────────────────── */

/** 首页 → 科目主页。按科目名找卡片，不靠索引顺序。 */
const OPEN_SUBJECT = `(() => {
  const cards = Array.from(document.querySelectorAll('[data-proto="nav-subject"]'));
  const card = cards.find((el) => el.textContent.includes('演示科目')) || cards[0];
  card.click();
})()`;

/** 科目主页 → 课件页（挑「浮点」那一课，它是唯一带 related 块的）。 */
const OPEN_LESSON = `(() => {
  const cards = Array.from(document.querySelectorAll('[data-proto="open-node"]'));
  const card = cards.find((el) => el.textContent.includes('浮点')) || cards[0];
  card.click();
})()`;

/** 整面读数：这一课是哪个、related 块里每条长什么样、正文里的普通链接有没有被顺手改掉。 */
const PROBE = `(() => {
  const text = (el) => (el ? el.textContent.trim() : null);
  const first = document.querySelector('.smb-related__link');
  // related 块没有标题，所以从站内那一条往上找它所在的提示块；整块里没有站内按钮时
  // （那一课没有 related 块）退到 null，探针照样不抛。
  const note = first ? first.closest('.smb-note') : null;
  const bullets = note ? Array.from(note.querySelectorAll('li')).map((li) => {
    const anchor = li.querySelector('a');
    const button = li.querySelector('button');
    return {
      text: li.textContent.trim(),
      anchor: anchor ? {
        href: anchor.getAttribute('href'),
        target: anchor.getAttribute('target'),
        rel: anchor.getAttribute('rel'),
      } : null,
      button: button ? {
        node: button.getAttribute('data-node'),
        type: button.type,
        href: button.getAttribute('href'),
        target: button.getAttribute('target'),
      } : null,
      wrapped: !!li.closest('a'),
    };
  }) : [];
  const bodyLinks = Array.from(document.querySelectorAll('article.smb-doc a')).map((a) => ({
    href: a.getAttribute('href'),
    target: a.getAttribute('target'),
    rel: a.getAttribute('rel'),
    inRelated: !!a.closest('.smb-note'),
  })).filter((one) => !one.inRelated);
  return {
    heading: text(document.querySelector('.smb-center__name')),
    crumb: text(document.querySelector('.smb-crumb--current')),
    href: location.href,
    noteFound: !!note,
    bullets,
    bodyLinks,
    buttons: note ? note.querySelectorAll('button').length : 0,
    anchorsInNote: note ? note.querySelectorAll('a').length : 0,
  };
})()`;

/** 点 related 块里某一条（按条目文字找，不靠顺序）。点不到时返回 false，别静默当成点过了。 */
function clickRelated(label) {
  return `(() => {
    const el = Array.from(document.querySelectorAll('.smb-related__link'))
      .find((one) => one.textContent.includes(${JSON.stringify(label)}));
    if (!el) return false;
    el.click();
    return true;
  })()`;
}

/* ── 主流程 ────────────────────────────────────────────────────────────── */

const { root, workspace } = makeWorkspace();
const payload = readLibrary({ workspace });
const fixture = buildFixture(root, payload);
/** 夹具页的地址：点完站内那一课，地址必须一字不变（没新开窗口、也没跳页）。 */
const FIXTURE_URL = fixture;

const session = await openSession({ suite: 'related-links', width: 1440, height: 960 });

await session.scene('related-links', async (ctx) => {
  await ctx.navigate(fixture, { settle: 1200 });
  await ctx.evaluate(OPEN_SUBJECT);
  await ctx.sleep(400);
  await ctx.evaluate(OPEN_LESSON);
  await ctx.sleep(500);
  const seen = await ctx.evaluate(PROBE);

  check('落到了带 related 块的那一课', seen.heading === '浮点与精度' && seen.noteFound,
    `${seen.heading} / note=${seen.noteFound}`);
  check('related 块里五条都在', seen.bullets.length === 5,
    JSON.stringify(seen.bullets.map((one) => one.text)));

  const [bare, prefixed, external, anchor, wrong] = seen.bullets;
  const shape = (one) => JSON.stringify(one);

  // 站内那两条：按钮、带节点 id、没有 href / target（不是「长得像链接的新窗口」）
  check('裸写法（`0002-整数`）是站内按钮，指到「整数」那一课',
    !!bare && !!bare.button && bare.button.node === '整数' && bare.button.type === 'button'
    && bare.button.href === null && bare.button.target === null && bare.anchor === null,
    shape(bare));
  check('带 `lessons/` 前缀与 `.md` 后缀的写法同样认',
    !!prefixed && !!prefixed.button && prefixed.button.node === '整数'
    && prefixed.button.href === null && prefixed.button.target === null && prefixed.anchor === null,
    shape(prefixed));
  check('站内那两条不是包在 <a> 里的（没有被打开器当外链）',
    !!bare && bare.wrapped === false && !!prefixed && prefixed.wrapped === false,
    `${bare && bare.wrapped} / ${prefixed && prefixed.wrapped}`);

  // 外链与页内锚点：一个字不改
  check('外链照旧：target="_blank" + rel="noreferrer"',
    !!external && !!external.anchor && external.anchor.href === 'https://oi-wiki.org/lang/branch/'
    && external.anchor.target === '_blank' && external.anchor.rel === 'noreferrer' && !external.button,
    shape(external));
  check('页内锚点照旧：`#小结` 也是 target="_blank"',
    !!anchor && !!anchor.anchor && anchor.anchor.href === '#小结'
    && anchor.anchor.target === '_blank' && !anchor.button,
    shape(anchor));

  // 比不中：纯文字
  check('写错的那一条只剩文字：不是 <a>、也不是 <button>',
    !!wrong && wrong.anchor === null && wrong.button === null && wrong.text.includes('写错的那一条'),
    shape(wrong));
  check('整块里恰好两颗按钮、两个 <a>（不多一个「顺手渲染」的链接）',
    seen.buttons === 2 && seen.anchorsInNote === 2,
    `buttons=${seen.buttons} anchors=${seen.anchorsInNote}`);

  // 这一条**不是**这张票的验收面，是反证：正文里的普通链接一个字没改（含仓库内路径）
  const bodyHrefs = seen.bodyLinks.map((one) => one.href);
  check('正文里的普通链接照旧（外链与仓库内路径都还是 target="_blank" 的 <a>）',
    seen.bodyLinks.length === 2 && seen.bodyLinks.every((one) => one.target === '_blank')
    && bodyHrefs.includes('https://example.com/doc') && bodyHrefs.includes('0003-指针'),
    JSON.stringify(seen.bodyLinks));

  return {
    heading: seen.heading,
    bullets: seen.bullets,
    bodyLinks: seen.bodyLinks,
    buttons: seen.buttons,
    anchorsInNote: seen.anchorsInNote,
  };
});

await session.scene('related-open', async (ctx) => {
  await ctx.navigate(fixture, { settle: 1200 });
  await ctx.evaluate(OPEN_SUBJECT);
  await ctx.sleep(400);
  await ctx.evaluate(OPEN_LESSON);
  await ctx.sleep(500);

  const before = await ctx.evaluate(PROBE);
  check('开场停在「浮点与精度」那一课', before.heading === '浮点与精度', String(before.heading));

  // 1. 写错的那一条是纯文字：点它什么也不该发生（既不开新窗口，也不换个页面）
  const clickedWrong = await ctx.evaluate(`(() => {
    const li = Array.from(document.querySelectorAll('.smb-note li'))
      .find((one) => one.textContent.includes('写错的那一条'));
    if (!li) return 'missing';
    const target = li.querySelector('a, button');
    if (target) return 'clickable';
    li.click();
    return 'plain';
  })()`);
  await ctx.sleep(300);
  const afterWrong = await ctx.evaluate(PROBE);
  check('写错的那一条点不动：没有可点的元素，点了页面还在原地',
    clickedWrong === 'plain' && afterWrong.heading === '浮点与精度' && afterWrong.href === before.href,
    `${clickedWrong} / ${afterWrong.heading}`);

  // 2. 站内那一条：这一页换成那一课，地址一字不变
  const clicked = await ctx.evaluate(clickRelated('带前缀与后缀'));
  await ctx.sleep(600);
  const after = await ctx.evaluate(PROBE);

  check('站内那一条真的点得动（找到了那一颗按钮）', clicked === true, String(clicked));
  check('点了就地打开那一课（标题与面包屑都换成「整数」）',
    after.heading === '整数' && after.crumb === '整数', `${after.heading} / ${after.crumb}`);
  check('没有开新窗口：地址还是夹具页那一条、与点之前一字不差', after.href === before.href,
    `${after.href} ≠ ${before.href}（夹具页 ${FIXTURE_URL}）`);
  check('换成那一课之后 related 按钮不再出现（不是留在上一课的页面上）',
    after.buttons === 0 && after.bullets.length === 0, `buttons=${after.buttons}`);

  return {
    from: before.heading, to: after.heading, crumb: after.crumb,
    hrefStable: after.href === before.href, buttonsAfter: after.buttons,
    wrongClickable: clickedWrong,
  };
});

await finishSuite(session, { suite: 'related-links', failed: failures });
for (const dir of TEMPS) fs.rmSync(dir, { recursive: true, force: true });
