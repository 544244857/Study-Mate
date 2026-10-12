#!/usr/bin/env node
/* engine-node 安装 + 整形（幂等，启动器 / CI / 开发机各跑一次即可）。
 *
 * 上游发布包有两个包装坑（见 docs/StudyMate-Web_引擎复用与回流.md §4），都在这里固化掉：
 *   坑① node 拒绝 type-strip `node_modules` 里的 `.ts` —— 把包整份拷出 `vendor/studymate` 再跑；
 *   坑② 导出的 React 解析只认 `react-dom/node_modules/scheduler` 的 pnpm 式嵌套 —— 补一层拷贝。
 * 完成后自检：按文件 URL import 三个 CLI 真正用到的模块并核对导出面。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(HERE, 'vendor', 'studymate');
const PKG_IN_NM = path.join(HERE, 'node_modules', '@yunmiao', 'studymate');

function log(line) {
  process.stdout.write(`setup: ${line}\n`);
}

function fatal(message) {
  process.stderr.write(`setup: ${message}\n`);
  process.exit(1);
}

/** 从 fromDir 出发按 Node 规则定位 `<name>/package.json`，返回包根目录（找不到返回 null）。 */
function locatePackage(name, fromDir) {
  try {
    const require = createRequire(path.join(fromDir, 'noop.cjs'));
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

/** src → dest 的整包拷贝（先删后拷，幂等）。 */
function copyTree(src, dest) {
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

/** 确保 `parentDir/node_modules/<name>` 有一份；命中已有位置就跳过。 */
function ensureNestedPackage(name, parentDir) {
  const nested = path.join(parentDir, 'node_modules', name);
  const found = locatePackage(name, parentDir);
  if (found === null) fatal(`装完后仍解析不到 ${name}（npm 安装布局异常？删掉 node_modules 重跑）`);
  const foundReal = fs.realpathSync(found);
  const nestedReal = fs.existsSync(nested) ? fs.realpathSync(nested) : '';
  if (foundReal === nestedReal) return nested;
  copyTree(found, nested);
  log(`补拷贝 ${name} → ${path.relative(HERE, nested)}`);
  return nested;
}

// 一、安装：有 lock 走 `npm ci`（CI 与本地同一入口）；已装齐则跳过（幂等快路径）。
// 「装齐」= 上游包与 React 都在（React 由我们钉版本直装，上游发布包里不声明它）。
const installComplete = fs.existsSync(PKG_IN_NM) && fs.existsSync(path.join(HERE, 'node_modules', 'react', 'package.json'));
if (!installComplete) {
  const hasLock = fs.existsSync(path.join(HERE, 'package-lock.json'));
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  // Windows 上 Node ≥20 直接 spawnSync 一个 .cmd 会 EINVAL（安全改动），必须过 shell；
  // 参数只有 ci/install 两个字面量，无注入面。
  const proc = spawnSync(npmCmd, [hasLock ? 'ci' : 'install'], {
    cwd: HERE, encoding: 'utf8', windowsHide: true, timeout: 900_000, shell: true,
  });
  if (proc.error) fatal(`npm 启动失败：${proc.error.message}`);
  if (proc.status !== 0) {
    fatal(`npm ${hasLock ? 'ci' : 'install'} 退出码 ${proc.status}：${String(proc.stderr || proc.stdout || '').slice(-800)}`);
  }
  log('npm 安装完成');
} else {
  log('node_modules 已就绪，跳过安装（重装请删 node_modules）');
}
if (!fs.existsSync(PKG_IN_NM)) fatal(`安装后仍没有 node_modules/@yunmiao/studymate`);

// 二、坑①：把包拷出 node_modules（vendor 里 node 才肯 strip 类型）
copyTree(PKG_IN_NM, VENDOR);
const version = JSON.parse(fs.readFileSync(path.join(VENDOR, 'package.json'), 'utf8')).version;
log(`已拷出 vendor/studymate（@yunmiao/studymate@${version}）`);

// 三、坑②：React 三件套落进 vendor 自己的 node_modules，scheduler 补到 react-dom 嵌套下
//（`lib/export/react.ts` 解析 scheduler 的路径写死 `react-dom/node_modules/scheduler`）
ensureNestedPackage('react', VENDOR);
const reactDomDir = ensureNestedPackage('react-dom', VENDOR);
ensureNestedPackage('scheduler', reactDomDir);

// 四、自检：三个 CLI 真正 import 的模块 + 关键导出面，一次验完
const check = `
const lesson = await import(${JSON.stringify(pathToFileURL(path.join(VENDOR, 'lib/core/lesson.ts')).href)});
const validate = await import(${JSON.stringify(pathToFileURL(path.join(VENDOR, 'lib/core/validate.ts')).href)});
const exportCli = await import(${JSON.stringify(pathToFileURL(path.join(VENDOR, 'lib/export/cli.ts')).href)});
const yaml = await import(${JSON.stringify(pathToFileURL(path.join(VENDOR, 'lib/yaml.ts')).href)});
const workspace = await import(${JSON.stringify(pathToFileURL(path.join(VENDOR, 'lib/workspace.ts')).href)});
const surface = { parseLesson: lesson.parseLesson, validateCurriculum: validate.validateCurriculum,
  validateProgress: validate.validateProgress, validateSubject: validate.validateSubject,
  exportCommand: exportCli.exportCommand, parseYaml: yaml.parseYaml, readConfigObject: workspace.readConfigObject };
for (const [name, fn] of Object.entries(surface)) {
  if (typeof fn !== 'function') { console.error('缺少导出：' + name); process.exit(1); }
}
`;
const probe = spawnSync(process.execPath, ['--input-type=module', '--eval', check], {
  cwd: HERE, encoding: 'utf8', windowsHide: true, timeout: 120_000,
});
if (probe.status !== 0) {
  fatal(`自检失败（多半是上游改了模块路径或导出名）：${String(probe.stderr || probe.stdout || '').slice(-800)}`);
}
log('自检通过：三 CLI 用到的模块与导出面齐全');
log('就绪');
