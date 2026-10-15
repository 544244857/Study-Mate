/* 主观题展开面板**按题型给字段**（#175）· **阅读端这一半**
   ────────────────────────────────────────────────────────────────────────
   判分要点（`criteria`）是**共享字段**：出题规范要求每题的判分要点都写进它，不只开放题。
   所以在 Node 里跑真的 `lib/client.js`（`fixtures/client_harness.mjs`，React 是桩），把
   `SubjectiveBody` 这一支逐题型调起来，断言：

     · **预测验证 / 交付物**展开后有「判分要点」那一块（带 criteria 时）；
     · **开放题**照旧两块：参考答案 + 判分要点（展示不变，`criteria` 仍是它的必填字段）；
     · 其余题型**没写** criteria 时不占一块只有标题的空档。

   渲染结果在真浏览器里长什么样在 `--browser` 组的 `reading_routes_test.mjs`（右栏题库那一场）；
   这里断的是「元素树里有没有那一块、标题与正文对不对」。 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { clientInternals, findByProp, viewText } from './fixtures/client_harness.mjs';

const { SubjectiveBody } = clientInternals();

/** 展开态的主观题正文（`open` 是父组件给的 prop，这里直接置 true）。 */
function body(item, kind) {
  return SubjectiveBody({
    item, kind, open: true, setOpen: () => {}, self: null, onSelf: () => {}, lab: null,
  });
}

/** 元素树里的「参考内容」块（每块一个标题 + 一段正文）。 */
const refs = (node) => findByProp(node, 'className', 'smb-ref');
const refTitles = (node) => refs(node).map((ref) => viewText(ref));

test('#175：预测验证展开后有判分要点（criteria 是共享字段）', () => {
  const node = body({
    kind: '预测验证', q: '先预测整数除法的结果，再运行比较。',
    预测: '整除了，结果是 4。', 比对: '实测 4——它真的整除了。', criteria: '先预测、有实测、能解释差异。',
  }, '预测验证');

  assert.equal(refs(node).length, 3, '预测 / 比对 / 判分要点三块都要在');
  const titles = refTitles(node);
  assert.ok(titles.some((text) => text.includes('先写下预测')), `少了预测那块：${titles.join('｜')}`);
  assert.ok(titles.some((text) => text.includes('跑完之后')), `少了比对那块：${titles.join('｜')}`);
  assert.ok(titles.some((text) => text.includes('判分要点')), `少了判分要点那块：${titles.join('｜')}`);
  assert.match(titles.join('｜'), /先预测、有实测、能解释差异。/, '判分要点的正文要原样在');
});

test('#175：交付物展开后有判分要点，且代跑块照旧挂着', () => {
  const lab = { type: 'div', props: { className: 'smb-lab-stub', children: '跑一次' } };
  const node = SubjectiveBody({
    item: {
      kind: '交付物', q: '实现指定接口并运行测试。',
      交付物: '接口实现与测试文件。', 证据: 'node test.mjs', criteria: '测试通过并说明接口契约。',
    },
    kind: '交付物', open: true, setOpen: () => {}, self: null, onSelf: () => {}, lab,
  });

  assert.equal(refs(node).length, 3, '交付物 / 证据 / 判分要点三块都要在');
  const titles = refTitles(node);
  assert.ok(titles.some((text) => text.includes('可运行证据')), `少了证据那块：${titles.join('｜')}`);
  assert.ok(titles.some((text) => text.includes('判分要点')), `少了判分要点那块：${titles.join('｜')}`);
  assert.match(titles.join('｜'), /测试通过并说明接口契约。/, '判分要点的正文要原样在');
  assert.equal(findByProp(node, 'className', 'smb-lab-stub').length, 1, '代跑块还挂在展开内容里');
});

test('#175：开放题展示不变（参考答案 + 判分要点两块）', () => {
  const node = body({ kind: '开放题', q: '为什么？', answer: '因为……', criteria: '说清因果。' }, '开放题');
  const titles = refTitles(node);
  assert.equal(titles.length, 2, `开放题仍是两块：${titles.join('｜')}`);
  assert.ok(titles[0].startsWith('参考答案'), `第一块是参考答案：${titles[0]}`);
  assert.ok(titles[1].startsWith('判分要点'), `第二块是判分要点：${titles[1]}`);
});

test('#175：非开放题没写 criteria 时不占一块只有标题的空档', () => {
  const predict = body({ kind: '预测验证', q: '?', 预测: 'p', 比对: 'b' }, '预测验证');
  assert.equal(refs(predict).length, 2, '没有判分要点就只渲染预测与比对');
  const deliver = body({ kind: '交付物', q: '?', 交付物: 'd', 证据: 'e' }, '交付物');
  assert.equal(refs(deliver).length, 2, '没有判分要点就只渲染交付物与证据');
});
