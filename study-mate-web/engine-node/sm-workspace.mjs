#!/usr/bin/env node
/* sm-workspace —— 工作区发现 CLI。
 *
 * 用法：sm-workspace.mjs [--workspace 显式]
 * 契约：stdout 一行解析出的工作区绝对路径；退出码 0 解析到 / 1 解析不到（stderr 说明）。
 * 查找顺序与冻结 Python 的 `gen_home.py::learn_workspace()` 逐字对齐：
 *   `--workspace` → $STUDYMATE_WORKSPACE → $LEARN_WORKSPACE
 *   → $STUDYMATE_CONFIG / $DSH_HOME/studymate-config.yaml 的 workspace 字段。
 * 后端拿退出码 1 时兜底 `~/StudyMate`（与旧口径一致，兜底不在这里做）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { die, expandUser, flagString, parseArgs, vendorModule } from './sm-lib.mjs';

const { flags } = parseArgs(process.argv.slice(2));
const env = process.env;

const explicit = flagString(flags, 'workspace')
  || String(env.STUDYMATE_WORKSPACE || '').trim()
  || String(env.LEARN_WORKSPACE || '').trim();
if (explicit) {
  process.stdout.write(`${path.resolve(expandUser(explicit))}\n`);
  process.exit(0);
}

const cfgPath = String(env.STUDYMATE_CONFIG || '').trim()
  || path.join(String(env.DSH_HOME || '').trim() || path.join(os.homedir(), '.dsh'), 'studymate-config.yaml');
if (fs.existsSync(cfgPath)) {
  const ws = await vendorModule('lib/workspace.ts');
  const cfg = ws.readConfigObject(cfgPath);
  const configured = cfg && typeof cfg.workspace === 'string' ? cfg.workspace.trim() : '';
  if (configured) {
    process.stdout.write(`${path.resolve(expandUser(configured))}\n`);
    process.exit(0);
  }
  die(`工作区配置 ${cfgPath} 里没有可用的 workspace 字段`, 1);
}
die(`没找到工作区：--workspace 未给，STUDYMATE_WORKSPACE / LEARN_WORKSPACE 未设，配置文件 ${cfgPath} 不存在`, 1);
