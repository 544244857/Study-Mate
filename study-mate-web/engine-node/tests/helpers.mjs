/* 契约测试共用件：起临时科目夹具 + 跑 CLI 子进程。
 * 夹具形状来自包内 schemas（curriculum 节点必填 id/title/objective/prerequisites/status/kind；
 * front matter 只有 title/goal 两字段——课件格式规则以包内 lib/core 为准，这里只造最小合法件）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ENGINE_NODE = path.resolve(import.meta.dirname, '..');
export const SM_EXPORT = path.join(ENGINE_NODE, 'sm-export.mjs');
export const SM_VALIDATE = path.join(ENGINE_NODE, 'sm-validate.mjs');
export const SM_WORKSPACE = path.join(ENGINE_NODE, 'sm-workspace.mjs');

export const GOOD_CURRICULUM = [
  'nodes:',
  '  - id: intro',
  '    title: 测试课',
  '    objective: 会做一次最小提交',
  '    prerequisites: []',
  '    status: 未开始',
  '    kind: 概念',
  'edges: []',
  '',
].join('\n');

export const GOOD_LESSON = [
  '---',
  'title: 测试课',
  'goal: 会做一次最小提交',
  '---',
  '',
  '## 为什么要版本控制',
  '',
  '文件只有一个当前状态，改坏了想找却找不到。',
  '',
  '::: quiz 理解 锚点：为什么要版本控制',
  ':::',
  '',
].join('\n');

export const GOOD_POOL = JSON.stringify(
  {
    为什么要版本控制: [
      {
        q: '下面哪个是版本控制解决的问题？',
        opts: ['文件改坏了找不回旧版本', '文件太大', '打不开文件', '文件名太长'],
        ans: 0,
        why: '版本控制保存历史，改坏可回退。',
      },
    ],
  },
  null,
  2,
);

/** 跑一个 sm-*.mjs，返回 {status, stdout, stderr}。 */
export function runCli(script, args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, ...env },
  });
}

/** 在临时目录造一个最小科目；返回 {root, subject, cleanup}。 */
export function makeSubject({ lesson = GOOD_LESSON, pool = GOOD_POOL, curriculum = GOOD_CURRICULUM, slug = 'demo' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-contract-'));
  const subject = path.join(root, '.learning', 'subjects', slug);
  fs.mkdirSync(path.join(subject, 'lessons'), { recursive: true });
  fs.writeFileSync(path.join(subject, 'curriculum.yaml'), curriculum);
  fs.writeFileSync(path.join(subject, 'lessons', '0001-intro.md'), lesson);
  if (pool !== null) fs.writeFileSync(path.join(subject, 'lessons', '0001-intro.quiz.json'), pool);
  return {
    root,
    subject,
    lessonFile: path.join(subject, 'lessons', '0001-intro.md'),
    /** subject 下相对路径的绝对路径。 */
    subjectPath: (rel) => path.join(subject, ...rel.split('/')),
    /** 写一份文件进科目目录，返回其绝对路径。 */
    writeFile: (rel, content) => {
      const file = path.join(subject, ...rel.split('/'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      return file;
    },
    /** 写 progress.yaml（校验 progress 时的兄弟 curriculum 已由 makeSubject 备好）。 */
    writeProgress: (progress) => {
      const file = path.join(subject, 'progress.yaml');
      fs.writeFileSync(file, progress);
      return file;
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

/** 解析 CLI 输出的一行 JSON 报告。 */
export function parseReport(stdout) {
  return JSON.parse(stdout.trim().split('\n').pop());
}
