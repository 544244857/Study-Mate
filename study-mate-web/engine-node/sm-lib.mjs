/* 三个 sm-*.mjs CLI 的共用件：参数解析、vendor 定位、报错出口。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VENDOR = path.join(HERE, 'vendor', 'studymate');

/** 自身错误出口（不是被校验数据的判定）：stderr 一句人话，退出码 1。 */
export function die(message, code = 1) {
  process.stderr.write(`sm: ${message}\n`);
  process.exit(code);
}

/** `--key value` / `--flag` / 可重复的 `--subject`；其余进 positional。 */
export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  const LISTABLE = new Set(['subject']);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    if (LISTABLE.has(key)) {
      if (!Array.isArray(flags[key])) flags[key] = [];
      flags[key].push(next);
    } else {
      flags[key] = next;
    }
    i += 1;
  }
  return { flags, positional };
}

/** 字符串 flag（未给或非字符串时返回 undefined）。 */
export function flagString(flags, key) {
  return typeof flags[key] === 'string' && flags[key] !== '' ? flags[key] : undefined;
}

/** `~` 开头的路径展开为家目录（对齐 Python 的 expanduser）。 */
export function expandUser(raw) {
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return path.join(os.homedir(), raw.slice(2));
  return raw;
}

/** vendor 缺件时报一句可操作的错（先跑 setup）。 */
export function requireVendor() {
  if (!fs.existsSync(path.join(VENDOR, 'package.json'))) {
    die('缺引擎包产物 vendor/studymate —— 先在 study-mate-web/engine-node 里跑 `node setup.mjs`');
  }
}

/** 按 vendor 相对路径动态 import（包在 node_modules 之外，node 直接 type-strip）。 */
export async function vendorModule(rel) {
  requireVendor();
  const file = path.join(VENDOR, ...rel.split('/'));
  if (!fs.existsSync(file)) {
    die(`引擎包缺少文件 ${rel}（上游改过结构？核对 setup 自检）`);
  }
  return import(pathToFileURL(file).href);
}

/** 读包内 schema（`schemas/*.json` 随包发货）。 */
export async function vendorSchema(name) {
  requireVendor();
  const file = path.join(VENDOR, 'schemas', name);
  if (!fs.existsSync(file)) {
    die(`引擎包缺少 schema ${name}（上游改过结构？核对 setup 自检）`);
  }
  const loaded = await import(pathToFileURL(file).href, { with: { type: 'json' } });
  return loaded.default;
}
