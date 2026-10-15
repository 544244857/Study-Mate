/* 工作区数据骨架（`templates/`）的**文件清单**：源在盘上是唯一真相。
   ────────────────────────────────────────────────────────────────────────
   同一批文件在几处各有一份「要发出去的东西」清单——`package.json` 的 `files`、安装器的
   引擎副本、两个无头宿主插件的构建、发布 tarball 的必带清单。它们是**分开维护**的，
   于是「骨架里加了新文件、某一条路没跟上」这种缺陷今天门禁照样绿（发出去的插件少一份
   骨架，学生照文档做时就撞上一个不存在的文件）。

   所以清单只有这里一份：各条路拿**自己那份产物**与源逐文件对一遍，而不是各自手抄一串
   文件名（手抄的那串正是会漏的地方）。`fixtures/` 目录不被套件覆盖率遍历，所以这份
   helper 不用登记成套件。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 源骨架的根：`<仓库根>/templates/`。 */
export const TEMPLATES = fileURLToPath(new URL('../../../templates/', import.meta.url));

/** `templates/` 下全部文件的相对路径（相对 `templates/`，正斜杠），已排序。 */
export function templateFiles(root = TEMPLATES) {
  const found = [];
  const walk = (dir, prefix = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), relative);
      else found.push(relative);
    }
  };
  walk(root);
  return found.sort();
}

/**
 * 产物里缺了哪些骨架文件——传产物的根（插件目录、解出来的 ZIP、装出来的引擎目录都行），
 * 空数组 = 骨架一份不落。文件内容不在这里对（各条路自己的套件负责）。
 */
export function missingTemplateFiles(produced) {
  return templateFiles().filter(relative => !fs.existsSync(path.join(produced, 'templates', relative)));
}
