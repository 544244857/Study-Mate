"use client";

import { useEffect, useState, type JSX } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

import { api } from "@/lib/api";
import type { WorkspaceParam } from "@/lib/api";

// 工作区首页的嵌入：先调 /api/home/reading 按需导出全工作区（缓存命中则秒回），
// 再嵌返回的导出应用 URL。产物没生成时不再静默 404 白屏（硬编码产物路径的旧写法，
// 全新 data/exports 下必白屏），改显加载 / 错误态，错误可重试。
export function HomeEmbed({ workspace = null }: { workspace?: WorkspaceParam }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setUrl(null);
    api
      .getHomeReading(workspace)
      .then((info) => {
        if (alive) setUrl(info.url);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [workspace, reloadKey]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <AlertCircle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-red-500">工作区首页加载失败：{error}</p>
        <button
          type="button"
          data-testid="home-embed-retry"
          onClick={() => setReloadKey((k) => k + 1)}
          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-[var(--muted)]"
          style={{ borderColor: "var(--border)" }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          重试
        </button>
      </div>
    );
  }

  if (loading || !url) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin opacity-50" />
      </div>
    );
  }

  return (
    <iframe
      data-testid="home-embed"
      src={url}
      title="我的课程"
      className="h-full w-full border-0"
    />
  );
}
