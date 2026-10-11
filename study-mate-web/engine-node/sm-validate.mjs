#!/usr/bin/env node
/* sm-validate —— 课件 / 数据校验 CLI（包装上游 `lib/core` 的纯函数校验器）。
 *
 * 用法：
 *   sm-validate.mjs lesson <file.md> [--subject <科目目录>]
 *   sm-validate.mjs curriculum <curriculum.yaml>
 *   sm-validate.mjs progress <progress.yaml>
 *   sm-validate.mjs subject <subject.yaml>
 * 契约（对齐上游 `lib/tools/validate.ts` 的判定口径）：
 *   stdout 一行 JSON：{file, blocking, blockingCount, problems[{file,line,message,blocking}], summary}
 *   （lesson 另附 anchors / orphans 对账明细）
 *   退出码：0 放行；2 有阻断问题（problems 即打回依据）；1 自身错误（文件不存在等，stderr）。
 * schema 用包内 `schemas/*.json`（随包发货）——规则的单源就是上游包本身。
 */
import fs from 'node:fs';
import path from 'node:path';
import { die, flagString, parseArgs, vendorModule, vendorSchema } from './sm-lib.mjs';

const [kind, ...rest] = process.argv.slice(2);
const { flags, positional } = parseArgs(rest);

/** 打一行报告并按 blocking 定退出码（0 放行 / 2 阻断）。 */
function emit(report) {
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.blocking ? 2 : 0;
}

function conclude(problems) {
  const blockingCount = problems.filter((item) => item.blocking).length;
  return {
    blocking: blockingCount > 0,
    blockingCount,
    summary: blockingCount > 0
      ? `阻断——${blockingCount} 条阻断问题（共 ${problems.length} 条）`
      : (problems.length > 0 ? `放行——${problems.length} 条提示` : '放行——没有问题'),
  };
}

/* ── lesson：内容格式 + 锚点四态对账 + 图片存在性（parseLesson 全套） ── */

/** 从课件路径向上找带 curriculum.yaml 的目录当科目目录（lessons/、lab/** 都覆盖）。 */
function guessSubjectDir(lessonAbs) {
  let dir = path.dirname(lessonAbs);
  for (let depth = 0; depth < 3; depth += 1) {
    if (fs.existsSync(path.join(dir, 'curriculum.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** 大纲里这一课的节点（编号-文件名匹配，口径同上游工具壳 outlineNodeFor）。 */
async function outlineNodeFor(subjectDir, lessonAbs) {
  if (subjectDir === null) return null;
  const file = path.join(subjectDir, 'curriculum.yaml');
  if (!fs.existsSync(file)) return null;
  const { parseYaml } = await vendorModule('lib/yaml.ts');
  let value;
  try {
    value = parseYaml(fs.readFileSync(file, 'utf8'), { file });
  } catch {
    return null; // 大纲解不开：标题核对降级跳过（大纲自己坏自有 curriculum 校验报）
  }
  const nodes = value && typeof value === 'object' ? value.nodes : null;
  if (!Array.isArray(nodes)) return null;
  const base = path.basename(lessonAbs).replace(/\.md$/, '');
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index] ?? {};
    const id = typeof node.id === 'string' ? node.id : '';
    const number = String(index + 1).padStart(4, '0');
    if (id !== '' && base === `${number}-${id}`) {
      return { id, title: typeof node.title === 'string' ? node.title : '', number };
    }
  }
  return null;
}

async function lesson(target) {
  if (!target) die('用法：sm-validate lesson <file.md> [--subject <科目目录>]', 1);
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) die(`课件内容文件不存在：${abs}`, 1);
  const { parseLesson, poolJsonError, reportPoolShape } = await vendorModule('lib/core/lesson.ts');
  const { FormatProblems, decodeImageSrc } = await vendorModule('lib/core/format.ts');

  const text = fs.readFileSync(abs, 'utf8');
  // 与上游工具壳 validateOneLesson 同构：自己这份 problems 收集器装题库 JSON 的
  // 语法错/形状错，parseLesson 那份装格式与对账错，两边合并按 file:line:message 去重。
  const problems = new FormatProblems();

  const poolFile = abs.replace(/\.md$/, '.quiz.json');
  const poolPresent = fs.existsSync(poolFile);
  let pool = null;
  let poolRaw;
  if (poolPresent) {
    poolRaw = fs.readFileSync(poolFile, 'utf8');
    try {
      const value = JSON.parse(poolRaw);
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        reportPoolShape(poolFile, problems);
      } else {
        pool = value;
      }
    } catch (error) {
      poolJsonError(poolRaw, error, poolFile, problems);
    }
  }

  const subjectDir = flagString(flags, 'subject')
    ? path.resolve(flagString(flags, 'subject'))
    : guessSubjectDir(abs);
  const node = await outlineNodeFor(subjectDir, abs);

  const result = parseLesson(text, abs, {
    pool,
    poolFile,
    poolPresent,
    poolRaw,
    outlineTitle: node?.title,
    nodeId: node?.id,
    // 图片存在性按课件同目录解析（与 Python 渲染器 / 上游工具壳同口径）
    checkFigureSrc: (src) => {
      const decoded = path.resolve(path.dirname(abs), decodeImageSrc(src));
      return fs.existsSync(decoded) ? null
        : `图片文件不存在：${src}（解析到 ${decoded}）——从科目图片库 `
          + 'assets/img/pool/ 挑一张，或先采图';
    },
  });

  const merged = new Map();
  for (const error of [...problems.errors, ...result.errors]) {
    merged.set(`${error.file}\n${error.line}\n${error.message}`,
      { file: error.file, line: error.line, message: error.message, blocking: true });
  }
  for (const note of result.notes) {
    merged.set(`${note.file}\n${note.line}\n${note.message}`,
      { file: note.file, line: note.line, message: note.message, blocking: false });
  }
  const items = [...merged.values()];
  emit({
    file: abs,
    ...conclude(items),
    problems: items,
    anchors: (result.reconciliation?.anchors ?? []).map((anchor) => ({
      text: anchor.text, resolution: anchor.resolution, line: anchor.line, keys: anchor.keys,
    })),
    orphans: (result.reconciliation?.orphans ?? []).map((orphan) => ({
      key: orphan.key, line: orphan.line, count: orphan.count,
    })),
  });
}

/* ── curriculum / progress / subject：三份数据 YAML（schema 随包走） ── */

const SCHEMA_BY_KIND = {
  curriculum: 'curriculum.schema.json',
  progress: 'progress.schema.json',
  subject: 'subject.schema.json',
};

/** progress 校验要的引用完整性另一半：同目录 curriculum.yaml 的节点 id 表。 */
async function siblingNodeIds(abs) {
  const file = path.join(path.dirname(abs), 'curriculum.yaml');
  if (!fs.existsSync(file)) return [];
  const { parseYaml } = await vendorModule('lib/yaml.ts');
  try {
    const value = parseYaml(fs.readFileSync(file, 'utf8'), { file });
    const nodes = value && typeof value === 'object' ? value.nodes : null;
    if (!Array.isArray(nodes)) return [];
    return nodes
      .filter((node) => node && typeof node.id === 'string')
      .map((node) => node.id);
  } catch {
    return [];
  }
}

async function data(target) {
  if (!target) die(`用法：sm-validate ${kind} <file.yaml>`, 1);
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) die(`文件不存在：${abs}`, 1);
  const core = await vendorModule('lib/core/validate.ts');
  const { parseYaml, YamlParseError } = await vendorModule('lib/yaml.ts');
  const text = fs.readFileSync(abs, 'utf8');

  let value;
  try {
    value = parseYaml(text, { file: abs });
  } catch (error) {
    // 与上游工具壳 yamlProblems 同口径：解析失败是一条阻断问题，不是 CLI 错误
    const line = error instanceof YamlParseError ? error.line : 1;
    const items = [{ file: abs, line, message: `YAML 解不开：${error.message}`, blocking: true }];
    emit({ file: abs, ...conclude(items), problems: items });
    return;
  }

  const schema = await vendorSchema(SCHEMA_BY_KIND[kind]);
  let report;
  if (kind === 'curriculum') {
    report = core.validateCurriculum({ file: abs, value, text, schema });
  } else if (kind === 'progress') {
    report = core.validateProgress({ file: abs, value, text, schema, knownNodeIds: await siblingNodeIds(abs) });
  } else {
    report = core.validateSubject({ file: abs, value, text, schema, expectedSlug: path.basename(path.dirname(abs)) });
  }
  emit(report);
}

if (kind === 'lesson') {
  await lesson(positional[0]);
} else if (kind === 'curriculum' || kind === 'progress' || kind === 'subject') {
  await data(positional[0]);
} else {
  die('用法：sm-validate <lesson|curriculum|progress|subject> <file> [选项]', 1);
}
