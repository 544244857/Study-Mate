/* sm-validate 的 CLI 契约：退出码（0 放行 / 2 阻断 / 1 自身错误）、JSON 形状、上游判定透传。 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { GOOD_LESSON, makeSubject, parseReport, runCli, SM_VALIDATE } from './helpers.mjs';

test('lesson：最小合法课件放行，锚点对账为 resolved', () => {
  const fx = makeSubject();
  try {
    const run = runCli(SM_VALIDATE, ['lesson', fx.lessonFile]);
    assert.equal(run.status, 0, `stderr: ${run.stderr}`);
    const report = parseReport(run.stdout);
    assert.equal(report.blocking, false);
    assert.equal(report.blockingCount, 0);
    assert.deepEqual(report.problems, []);
    assert.equal(report.anchors.length, 1);
    assert.equal(report.anchors[0].resolution, 'resolved');
    assert.equal(report.orphans.length, 0);
  } finally {
    fx.cleanup();
  }
});

test('lesson：有 quiz 位置但没有题库文件 → 阻断（exit 2）', () => {
  const fx = makeSubject({ pool: null });
  try {
    const run = runCli(SM_VALIDATE, ['lesson', fx.lessonFile]);
    assert.equal(run.status, 2);
    const report = parseReport(run.stdout);
    assert.equal(report.blocking, true);
    assert.ok(report.problems.some((p) => p.message.includes('找不到题库')), JSON.stringify(report.problems));
    assert.ok(report.problems.every((p) => p.blocking === true));
  } finally {
    fx.cleanup();
  }
});

test('lesson：题库里有正文没引用的锚点（orphans）→ 阻断', () => {
  const pool = JSON.stringify({ 没被引用的锚点: [{ q: 'x', opts: ['a', 'b'], ans: 0, why: 'w' }] });
  const fx = makeSubject({ pool });
  try {
    const run = runCli(SM_VALIDATE, ['lesson', fx.lessonFile]);
    assert.equal(run.status, 2);
    const report = parseReport(run.stdout);
    assert.equal(report.blocking, true);
    assert.ok(report.problems.some((p) => p.message.includes('没有任何 ::: quiz')), JSON.stringify(report.problems));
  } finally {
    fx.cleanup();
  }
});

test('lesson：front matter title 与大纲节点 title 不一致 → 阻断', () => {
  const curriculum = [
    'nodes:',
    '  - id: intro',
    '    title: 另一个标题',
    '    objective: 会做一次最小提交',
    '    prerequisites: []',
    '    status: 未开始',
    '    kind: 概念',
    'edges: []',
    '',
  ].join('\n');
  const fx = makeSubject({ curriculum });
  try {
    const run = runCli(SM_VALIDATE, ['lesson', fx.lessonFile]);
    assert.equal(run.status, 2);
    const report = parseReport(run.stdout);
    assert.equal(report.blocking, true);
    assert.ok(report.problems.some((p) => p.message.includes('不一致')), JSON.stringify(report.problems));
  } finally {
    fx.cleanup();
  }
});

test('lesson：未知指令围栏 → 阻断且带可用清单', () => {
  const lesson = GOOD_LESSON.replace('::: quiz 理解 锚点：为什么要版本控制', ':::nope 神秘指令');
  const fx = makeSubject({ pool: null, lesson });
  try {
    const run = runCli(SM_VALIDATE, ['lesson', fx.lessonFile]);
    assert.equal(run.status, 2);
    const report = parseReport(run.stdout);
    assert.ok(report.problems.some((p) => p.message.includes('未知指令 ::: nope')), JSON.stringify(report.problems));
  } finally {
    fx.cleanup();
  }
});

test('lesson：不存在的图片 → checkFigureSrc 钩子报「图片文件不存在」', () => {
  const lesson = `${GOOD_LESSON}::: figure 不存在的图.png\n:::\n\n`;
  const fx = makeSubject({ pool: null, lesson });
  try {
    const run = runCli(SM_VALIDATE, ['lesson', fx.lessonFile]);
    assert.equal(run.status, 2);
    const report = parseReport(run.stdout);
    assert.ok(report.problems.some((p) => p.message.includes('图片文件不存在')), JSON.stringify(report.problems));
  } finally {
    fx.cleanup();
  }
});

test('lesson：文件不存在 → 自身错误 exit 1，无 JSON 报告', () => {
  const run = runCli(SM_VALIDATE, ['lesson', 'Z:/肯定不存在/lesson.md']);
  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes('不存在'));
  assert.throws(() => parseReport(run.stdout));
});

test('curriculum：语法坏 → 「YAML 解不开」阻断（exit 2）', () => {
  const fx = makeSubject({ curriculum: 'nodes: [未闭合\n' });
  try {
    const run = runCli(SM_VALIDATE, ['curriculum', fx.subjectPath('curriculum.yaml')]);
    assert.equal(run.status, 2);
    const report = parseReport(run.stdout);
    assert.equal(report.blocking, true);
    assert.ok(report.problems[0].message.includes('YAML 解不开'));
  } finally {
    fx.cleanup();
  }
});

test('curriculum：节点缺必填字段 → schema 阻断（exit 2）', () => {
  const curriculum = 'nodes:\n  - id: intro\n    title: 测试课\nedges: []\n';
  const fx = makeSubject({ curriculum });
  try {
    const run = runCli(SM_VALIDATE, ['curriculum', fx.subjectPath('curriculum.yaml')]);
    assert.equal(run.status, 2);
    const report = parseReport(run.stdout);
    assert.ok(report.problems.some((p) => p.message.includes('缺少必填字段')), JSON.stringify(report.problems));
  } finally {
    fx.cleanup();
  }
});

test('progress：三态最小进度放行（exit 0）', () => {
  const fx = makeSubject();
  const progress = 'updated_at: "2026-10-10T00:00:00Z"\nnodes:\n  intro:\n    status: 学习中\nproject:\n  current: ""\n';
  try {
    const run = runCli(SM_VALIDATE, ['progress', fx.writeProgress(progress)]);
    assert.equal(run.status, 0, `stderr: ${run.stderr}`);
    assert.equal(parseReport(run.stdout).blocking, false);
  } finally {
    fx.cleanup();
  }
});

test('progress：旧六档状态被新 schema 拒（exit 2）——回流数据迁移的信号', () => {
  const fx = makeSubject();
  const progress = 'updated_at: "2026-10-10T00:00:00Z"\nnodes:\n  intro:\n    status: 已掌握\nproject:\n  current: ""\n';
  try {
    const run = runCli(SM_VALIDATE, ['progress', fx.writeProgress(progress)]);
    assert.equal(run.status, 2);
    assert.equal(parseReport(run.stdout).blocking, true);
  } finally {
    fx.cleanup();
  }
});

test('subject：最小科目档案放行（exit 0）', () => {
  const fx = makeSubject({ slug: 'my-subject' });
  const subjectYaml = [
    'name: 测试科目',
    'slug: my-subject',
    'goal: 学完能独立完成一次最小提交',
    'created_at: "2026-10-10"',
    'status: 进行中',
  ].join('\n');
  try {
    const run = runCli(SM_VALIDATE, ['subject', fx.writeFile('subject.yaml', subjectYaml)]);
    assert.equal(run.status, 0, `stderr: ${run.stderr} / stdout: ${run.stdout}`);
    assert.equal(parseReport(run.stdout).blocking, false);
  } finally {
    fx.cleanup();
  }
});

test('未知子命令 → 自身错误 exit 1', () => {
  const run = runCli(SM_VALIDATE, ['wat', 'x.md']);
  assert.equal(run.status, 1);
});
