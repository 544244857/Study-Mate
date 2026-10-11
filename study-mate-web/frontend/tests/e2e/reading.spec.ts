import { expect, test } from "@playwright/test";

import { BACKEND_URL } from "./constants";

/**
 * 阅读入口（reading）：按需导出 + 缓存命中 + StaticFiles 伺服。
 *
 * E2E fixture 后端跑在 python 引擎（默认），这里的导出产物是 gen_home 主页；
 * node 引擎的产物形态（阅读端 SPA）由后端金样测试覆盖（tests/test_engine_golden.py）。
 * 接口契约两边一致：{url, entry, fresh, engine}，前端只认 url。
 */
const SLUG = "computer-networks";

test("health 带 engine 字段（模式分派的依据）", async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/api/health`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { status: string; engine: string };
  expect(body.status).toBe("ok");
  expect(["node", "python"]).toContain(body.engine);
});

test("reading：首次导出落产物，二次命中缓存，StaticFiles 可读", async ({ request }) => {
  const first = await request.get(`${BACKEND_URL}/api/courses/${SLUG}/reading`);
  expect(first.ok()).toBe(true);
  const info = (await first.json()) as { url: string; fresh: boolean; engine: string };
  expect(info.url).toBe(`/api/exports/${SLUG}/index.html`);
  expect(info.fresh).toBe(false);

  const second = await request.get(`${BACKEND_URL}/api/courses/${SLUG}/reading`);
  expect(second.ok()).toBe(true);
  expect(((await second.json()) as { fresh: boolean }).fresh).toBe(true);

  const entry = await request.get(`${BACKEND_URL}${info.url}`);
  expect(entry.ok()).toBe(true);
  expect(entry.headers()["content-type"]).toContain("text/html");
});

test("强制重导端点仍可用（手动「导出静态工作区」按钮的后端）", async ({ request }) => {
  const res = await request.post(`${BACKEND_URL}/api/courses/${SLUG}/export`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { ok: boolean; engine: string; index_file: string };
  expect(body.ok).toBe(true);
  expect(["node", "python"]).toContain(body.engine);
});
