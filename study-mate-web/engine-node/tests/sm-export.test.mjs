/* sm-export 的 CLI 契约：最小工作区导出成功、非工作区失败透传上游错误码。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { makeSubject, parseReport, runCli, SM_EXPORT } from './helpers.mjs';

test('export：最小工作区 → exit 0，单行 JSON，入口与清单落盘', () => {
  const fx = makeSubject();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-export-out-'));
  try {
    const run = runCli(SM_EXPORT, ['--workspace', fx.root, '--subject', 'demo', '--out', out, '--json']);
    assert.equal(run.status, 0, `stderr: ${run.stderr}`);
    const report = parseReport(run.stdout);
    assert.equal(report.ok, true);
    assert.ok(report.entry.endsWith('index.html'), report.entry);
    assert.ok(fs.existsSync(report.entry), '入口文件应真实存在');
    assert.ok(fs.existsSync(path.join(out, 'export.json')), '导出清单应落盘');
    assert.equal(report.subjects.length, 1);
    assert.equal(report.subjects[0].slug, 'demo');
    assert.ok(report.count >= 5, `产物应包含 React vendor + 客户端本体，实际 ${report.count}`);
    assert.ok(report.react && report.react.version, 'react 来源信息应进产物报告');
  } finally {
    fx.cleanup();
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('export：目录不像学习工作区 → exit 1，stderr 带上游错误码 EXPORT_NO_WORKSPACE', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-export-empty-'));
  try {
    const run = runCli(SM_EXPORT, ['--workspace', empty, '--out', path.join(empty, 'out'), '--json']);
    assert.equal(run.status, 1);
    assert.ok(run.stderr.includes('EXPORT_NO_WORKSPACE'), run.stderr);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});
