/**
 * @file BatchRenderButton — Client-side button to batch re-render article wiki links.
 *
 * Renders a dropdown button placed next to the search bar on the admin articles page.
 * Calls /api/admin/articles/render-all with an optional olderThanDays filter.
 * Shows a toast with the result count on completion.
 */

"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, RefreshCwOff, Loader2, ChevronDown, CheckCircle2, X } from "lucide-react";

export function BatchRenderButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const handleBatchRender = useCallback(
    async (olderThanDays?: number) => {
      setLoading(true);
      setToast(null);
      try {
        const res = await fetch("/api/admin/articles/render-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(olderThanDays !== undefined ? { olderThanDays } : {}),
        });
        const data = await res.json();
        if (res.ok) {
          setToast({
            message: `渲染完成：${data.succeeded || 0} 篇成功${data.failed ? `，${data.failed} 篇失败` : ""}`,
            type: "success",
          });
        } else {
          setToast({ message: data.error || "请求失败", type: "error" });
        }
      } catch {
        setToast({ message: "批量渲染请求失败", type: "error" });
      } finally {
        setLoading(false);
        setShowDropdown(false);
        startTransition(() => router.refresh());
      }
    },
    [router],
  );

  return (
    <div className="relative flex items-center gap-2">
      {/* Batch render dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
          title="批量刷新词条链接"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          <span className="text-xs hidden sm:inline">批量刷新</span>
          <ChevronDown className={`size-3 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
        </button>

        {showDropdown && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border border-border bg-popover p-2 shadow-lg">
              <div className="space-y-0.5">
                {[
                  { label: "超过 3 天未检测", days: 3 },
                  { label: "超过 7 天未检测", days: 7 },
                  { label: "超过 30 天未检测", days: 30 },
                  { label: "全部文章", days: undefined },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleBatchRender(opt.days)}
                    disabled={loading}
                    className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCwOff className="size-3.5 shrink-0" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Toast feedback */}
      {toast && (
        <div
          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border whitespace-nowrap animate-in fade-in slide-in-from-top-1 duration-200 ${
            toast.type === "success"
              ? "text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
              : "text-destructive bg-destructive/5 border-destructive/20"
          }`}
        >
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span className="max-w-[200px] truncate">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-1 hover:text-foreground transition-colors"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}
