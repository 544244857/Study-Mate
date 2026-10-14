import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { subjectDir } from "./constants";
import { openNodeDetail } from "./helpers";

test("status transitions follow the state machine and persist notes", async ({ page }) => {
  await openNodeDetail(page, "computer-networks", "4. TCP 与可靠传输");
  const detail = page.getByTestId("course-node-detail");
  const badge = detail.getByTestId("node-status-badge");
  const next = detail.getByTestId("node-next-statuses");
  await expect(badge).toHaveText("未开始");

  // 未开始只允许流向「学习中」（三档状态机，目标态规格 §5.2）
  await expect(next.getByRole("button", { name: "学习中" })).toBeVisible();
  await expect(next.getByRole("button", { name: "已学完" })).toHaveCount(0);

  await next.getByRole("button", { name: "学习中" }).click();
  await expect(badge).toHaveText("学习中");
  await expect(next.getByRole("button", { name: "已学完" })).toBeVisible();
  await expect(next.getByRole("button", { name: "学习中" })).toHaveCount(0);
  await expect(next.getByRole("button", { name: "未开始" })).toHaveCount(0);

  await detail.getByPlaceholder("记录你的理解、卡点…").fill("E2E 进度笔记：三次握手的时间轴已画完");
  await detail.getByRole("button", { name: "保存进度" }).click();
  await expect(detail.getByText("已保存")).toBeVisible();

  const progress = fs.readFileSync(
    path.join(subjectDir("computer-networks"), "progress.yaml"),
    "utf-8",
  );
  expect(progress).toMatch(/net\.tcp:[\s\S]*?status: 学习中/);
  expect(progress).toContain("E2E 进度笔记：三次握手的时间轴已画完");
});
