/* sm-workspace 的 CLI 契约：显式路径 / STUDYMATE_CONFIG / 什么都没有，三种分支。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCli, SM_WORKSPACE } from './helpers.mjs';

/** 清掉影响发现的环境变量（CI 上可能带着 LEARN_WORKSPACE / DSH_HOME）。 */
function bareEnv() {
  return {
    STUDYMATE_WORKSPACE: '',
    LEARN_WORKSPACE: '',
    STUDYMATE_CONFIG: '',
    DSH_HOME: path.join(os.tmpdir(), `sm-ws-missing-home-${process.pid}`),
  };
}

test('workspace：--workspace 显式路径 → 原样输出绝对路径，exit 0', () => {
  const run = runCli(SM_WORKSPACE, ['--workspace', os.tmpdir()], bareEnv());
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), path.resolve(os.tmpdir()));
});

test('workspace：STUDYMATE_CONFIG 指向带 workspace 字段的配置 → 输出该字段，exit 0', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-ws-home-'));
  const cfg = path.join(home, 'studymate-config.yaml');
  const target = path.join(home, '学习工作区');
  fs.writeFileSync(cfg, `workspace: "${target.replace(/\\/g, '/')}"\n`);
  try {
    const run = runCli(SM_WORKSPACE, [], { ...bareEnv(), STUDYMATE_CONFIG: cfg });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), path.resolve(target));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('workspace：env 与配置都没有 → exit 1，stderr 说明原因', () => {
  const run = runCli(SM_WORKSPACE, [], bareEnv());
  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes('没找到工作区'), run.stderr);
});
