"use client";

import type { JSX } from "react";

// 工作区首页的嵌入：全工作区导出的阅读端 SPA（/api/exports/_home/，后端按需刷新，
// 自带主题与首页；导出应用的相对资源都在 /api/exports/_home/ 前缀下，能正确解析）。
export function HomeEmbed(): JSX.Element {
  return (
    <iframe
      data-testid="home-embed"
      src="/api/exports/_home/index.html"
      title="我的课程"
      className="h-full w-full border-0"
    />
  );
}
