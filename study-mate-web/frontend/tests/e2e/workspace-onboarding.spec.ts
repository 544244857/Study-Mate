import path from "node:path";

import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

import { BACKEND_URL, E2E_DATA_DIR, E2E_WORKSPACE_DIR } from "./constants";

// 工作区引导块已退役：无科目时欢迎区只留一行提示，工作区选择在输入区上方的关联行里
// （含「选择文件夹…」目录浏览入口）。用空工作区覆盖「当前工作区还没有科目」的提示文案；
// 用例自己切走再切回（finally 兜底）。
const EMPTY_WS = path.join(E2E_DATA_DIR, "empty-ws");

async function switchWorkspace(request: APIRequestContext, target: string): Promise<void> {
  const response = await request.put(`${BACKEND_URL}/api/workspace`, { data: { path: target } });
  expect(response.status()).toBe(200);
}

test("a workspace without subjects shows the no-subject hint on the welcome area", async ({
  page,
  request,
}) => {
  await page.goto("/chat");
  await expect(page.getByRole("heading")).not.toHaveText("你好");

  // 默认工作区（fixture，含科目）不显示提示
  await expect(page.getByTestId("no-subject-hint")).toHaveCount(0);

  try {
    // 换到空工作区：科目列表变空，欢迎区出现新提示文案，左侧边栏显示暂无科目
    await switchWorkspace(request, EMPTY_WS);
    await page.reload();
    await expect(page.getByTestId("new-session-association")).toBeVisible();
    const hint = page.getByTestId("no-subject-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("当前工作区还没有科目");
    await expect(page.locator("aside").first().getByText("暂无科目")).toBeVisible();
  } finally {
    await switchWorkspace(request, E2E_WORKSPACE_DIR);
  }
});
