import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

import { BACKEND_URL, E2E_WORKSPACE_DIR } from "./constants";

// 「项目」分组（会话 = 绑定的工作区目录）：顶层「会话」只显示未绑定工作区的会话；
// 绑定过的按工作区路径归入「项目」各组，组头带删除 / + 新会话。
// 用例直接用后端 API 造数据（1 条绑定 <e2e-ws>/proj-x 的会话 + 1 条无绑定会话），
// 再走 UI 验证分组与整组删除（删会话、保留科目与文件夹）。
const PROJ_DIR = path.join(E2E_WORKSPACE_DIR, "proj-x");
const BOUND_TITLE = "项目 proj 会话";
const LOOSE_TITLE = "无绑定裸会话";

async function createSession(request: APIRequestContext, title: string) {
  const res = await request.post(`${BACKEND_URL}/api/sessions`, { data: {} });
  expect(res.status()).toBe(200);
  const session = (await res.json()) as { id: string };
  await request.patch(`${BACKEND_URL}/api/sessions/${session.id}`, { data: { title } });
  return session.id;
}

test("projects group bound sessions and bulk-delete removes them, keeping subjects", async ({
  page,
  request,
}) => {
  // proj-x 目录必须先存在，否则绑定会被后端 422 拒绝
  fs.mkdirSync(PROJ_DIR, { recursive: true });

  const boundId = await createSession(request, BOUND_TITLE);
  const bindRes = await request.patch(`${BACKEND_URL}/api/sessions/${boundId}`, {
    data: { workspace: PROJ_DIR },
  });
  expect(bindRes.status()).toBe(200);
  await createSession(request, LOOSE_TITLE);

  await page.goto("/chat");
  const sidebar = page.locator("aside").first();

  // 默认区显示无绑定会话；项目组按路径出现并显示绑定会话
  await expect(sidebar.getByText(LOOSE_TITLE)).toBeVisible();
  const projGroup = page
    .getByTestId("project-group")
    .filter({ has: page.getByTitle(PROJ_DIR) });
  await expect(projGroup).toBeVisible();
  await expect(projGroup.getByText("proj-x")).toBeVisible();
  await expect(projGroup.getByText(BOUND_TITLE)).toBeVisible();

  // 整组删除：确认后会话消失、项目组消失，但科目条目仍在
  page.on("dialog", (dialog) => void dialog.accept());
  await projGroup.getByTestId("project-delete").click();

  await expect(projGroup).toHaveCount(0);
  await expect(sidebar.getByText(BOUND_TITLE)).toHaveCount(0);
  await expect(sidebar.getByText(LOOSE_TITLE)).toBeVisible();
  await expect(sidebar.getByText("计算机网络").first()).toBeVisible();
  // 文件夹保留
  expect(fs.existsSync(PROJ_DIR)).toBe(true);
});
