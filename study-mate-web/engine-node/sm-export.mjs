#!/usr/bin/env node
/* sm-export —— 工作区静态导出 CLI（包装上游 `lib/export/cli.ts` 的 exportCommand）。
 *
 * 用法：sm-export.mjs --workspace W [--subject S]… --out O [--json] [--quiet]
 * 契约（后端只依赖这份契约，不依赖包内部结构）：
 *   stdout 一行 JSON：{ok, out, entry, files[], count, bytes, subjects[], react, summary}
 *   退出码：0 成功；1 失败（stderr 一句人话，消息里带上游错误码如 EXPORT_NO_WORKSPACE）；130 被中断。
 * 规则零自研：定位工作区、渲染、拷 React、写清单全走上游函数。
 */
import { parseArgs, flagString, vendorModule } from './sm-lib.mjs';

const { flags } = parseArgs(process.argv.slice(2));
const cli = await vendorModule('lib/export/cli.ts');

const json = flags.json === true;
const lines = [];
try {
  const code = await cli.exportCommand({
    workspace: flagString(flags, 'workspace'),
    out: flagString(flags, 'out'),
    subjects: Array.isArray(flags.subject) && flags.subject.length > 0 ? flags.subject : undefined,
    json,
    quiet: flags.quiet === true || json,
  }, {
    stdout: (line) => lines.push(line),
    stderr: (line) => process.stderr.write(`${line}\n`),
  });
  for (const line of lines) process.stdout.write(`${line}\n`);
  process.exitCode = code;
} catch (error) {
  // exportCommand 自己会收掉已知失败；走到这里是上游没兜住的意外
  process.stderr.write(`sm: 导出异常：${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
