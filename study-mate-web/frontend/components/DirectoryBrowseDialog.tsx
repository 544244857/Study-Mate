"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronLeft, FolderOpen, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface DirectoryBrowseDialogProps {
  open: boolean;
  onClose: () => void;
  /** 选定某个目录（该行的绝对路径）；纯会话级绑定，调用方负责采用，不触发任何写操作 */
  onSelect: (path: string) => void;
}

/** 拼接子目录绝对路径：按当前路径的风格选分隔符（Windows 反斜杠 / POSIX 正斜杠）。 */
function joinPath(base: string, name: string): string {
  const sep = base.includes("\\") ? "\\" : "/";
  if (!base) return name;
  return base.endsWith("\\") || base.endsWith("/") ? `${base}${name}` : `${base}${sep}${name}`;
}

/**
 * 服务端目录浏览弹窗：从根/当前目录逐级下钻，只列一级子目录（走 GET /api/fs/dirs）。
 *
 * 选定目录只是把路径回调出去（会话级工作区绑定）——**不调 PUT /api/workspace**，
 * 零全局副作用；目录由后端在首条消息到达时按需创建，前端不做任何创建动作。
 * 用「父路径栈」表示返回上一级：栈空即处在最顶层（此时隐藏返回按钮）。
 */
export function DirectoryBrowseDialog({ open, onClose, onSelect }: DirectoryBrowseDialogProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [dirs, setDirs] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 父路径栈：进入子目录时压入当前路径，返回时弹出；空表示已在最顶层
  const [parents, setParents] = useState<string[]>([]);

  const load = useCallback(async (path: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const info = await api.listDirs(path);
      setCurrentPath(info.path);
      setDirs(info.dirs);
      setTruncated(info.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // 每次打开都从根重新开始（不保留上次的浏览位置）
  useEffect(() => {
    if (!open) return;
    setParents([]);
    void load(null);
  }, [open, load]);

  const enter = (path: string) => {
    setParents((prev) => [...prev, currentPath]);
    void load(path);
  };

  const back = () => {
    if (parents.length === 0) return;
    const parent = parents[parents.length - 1] || null;
    setParents((prev) => prev.slice(0, -1));
    void load(parent);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm transition-all"
      data-testid="directory-browse-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="选择文件夹"
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] shadow-2xl ring-1 ring-[var(--border)]/50"
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-[var(--border)] bg-[var(--surface-subtle)]/70 px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <FolderOpen className="h-4 w-4 shrink-0" />
          </div>
          <span className="min-w-0 flex-1 font-serif text-base font-semibold text-[var(--foreground)]">
            选择文件夹
          </span>
        </header>

        <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] px-4 py-2">
          {parents.length > 0 && (
            <button
              type="button"
              data-testid="dir-back"
              onClick={back}
              className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs text-[var(--foreground)]/70 transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              title="返回上一级"
            >
              <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
              返回上一级
            </button>
          )}
          <span
            data-testid="dir-current-path"
            className="min-w-0 flex-1 break-all font-mono text-xs text-[var(--foreground)]/70"
            title={currentPath}
          >
            {currentPath}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-[var(--foreground)]/60">
              <Loader2 className="h-4 w-4 animate-spin opacity-50" />
              正在读取目录…
            </div>
          )}

          {!loading && error && (
            <div className="mx-2 my-2 flex flex-col items-start gap-2 rounded-xl border border-red-300/50 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 break-all">读取目录失败：{error}</span>
              </div>
              <button
                type="button"
                onClick={() => void load(currentPath || null)}
                className="rounded-lg border px-3 py-1.5 text-xs hover:bg-[var(--muted)]"
                style={{ borderColor: "var(--border)" }}
              >
                重试
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              {dirs.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-[var(--foreground)]/40">
                  此目录下没有子目录
                </p>
              )}
              {dirs.map((name) => {
                const path = joinPath(currentPath, name);
                return (
                  <div
                    key={path}
                    data-testid="dir-row"
                    data-path={path}
                    onClick={() => enter(path)}
                    className="group flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[var(--foreground)]/80 transition-colors hover:bg-[var(--muted)]/60 hover:text-[var(--foreground)]"
                  >
                    <FolderOpen className="h-4 w-4 shrink-0 opacity-50" />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <button
                      type="button"
                      data-testid="dir-pick"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(path);
                      }}
                      className="hidden shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-brand transition-colors hover:bg-brand/10 group-hover:block"
                      title={`选择 ${path}`}
                    >
                      选择
                    </button>
                  </div>
                );
              })}
              {truncated && (
                <p className="px-2 py-2 text-[11px] text-[var(--foreground)]/45">
                  子目录过多，仅显示前 {dirs.length} 个
                </p>
              )}
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-4 py-2 text-sm text-[var(--foreground)]/80 transition-colors hover:bg-[var(--muted)]"
            style={{ borderColor: "var(--border)" }}
          >
            取消
          </button>
        </footer>
      </div>
    </div>
  );
}
