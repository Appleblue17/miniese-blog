/**
 * @file /admin/reviews - AI Review history list page.
 *
 * Shows all AI review tasks with status, time, and quick links.
 * Supports pagination.
 */

import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowLeft, Bot } from "lucide-react";
import type { Metadata } from "next";
import type { ReviewTaskItem } from "@/app/api/admin/reviews/route";

export const metadata: Metadata = {
  title: "AI 审查历史 | Miniese's Blog",
};

const PAGE_SIZE = 20;

interface ReviewsResponse {
  tasks: ReviewTaskItem[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchData(page: number): Promise<ReviewsResponse> {
  try {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/admin/reviews?page=${page}&limit=${PAGE_SIZE}`, {
      cache: "no-store",
    });
    if (!res.ok) return { tasks: [], total: 0, page: 1, totalPages: 0 };
    return res.json();
  } catch {
    return { tasks: [], total: 0, page: 1, totalPages: 0 };
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    pending: {
      label: "等待中",
      color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    },
    processing: {
      label: "处理中",
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    },
    completed: {
      label: "已完成",
      color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
    failed: {
      label: "失败",
      color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    },
  };

  const c = config[status] ?? {
    label: status,
    color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${c.color}`}
    >
      {c.label}
    </span>
  );
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));

  const { tasks, total } = await fetchData(currentPage);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE)) || 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin"
          className="inline-flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI 审查历史</h1>
          <p className="text-sm text-muted-foreground mt-1">共 {total} 次审查任务</p>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Bot className="size-12 opacity-40" />
          <p className="text-lg">暂无审查记录</p>
          <p className="text-sm">还没有执行过 AI 审查，请在文章编辑页面发起审查。</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {tasks.map((task) => {
            const articleTitle = task.articleTitle;

            return (
              <Link
                key={task.id}
                href={`/admin/reviews/${task.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted"
              >
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Bot className="size-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate text-sm">
                      {articleTitle ?? "未知文章"}
                    </span>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>创建 {formatDate(task.createdAt)}</span>
                    {task.completedAt && <span>完成 {formatDate(task.completedAt)}</span>}
                    {task.output != null && (
                      <span>
                        {((
                          (task.output as Record<string, unknown>)?.summary as Record<
                            string,
                            unknown
                          >
                        )?.totalIssues as number) ?? 0}{" "}
                        个问题
                      </span>
                    )}
                    {task.error && <span className="text-destructive">错误: {task.error}</span>}
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0 ml-4" />
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 mt-6" aria-label="分页">
          <Link
            href={currentPage > 1 ? `/admin/reviews?page=${currentPage - 1}` : "#"}
            className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm ${
              currentPage <= 1
                ? "text-muted-foreground/40 pointer-events-none"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <ChevronLeft className="size-4" />
          </Link>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => {
              if (p === 1 || p === totalPages) return true;
              if (Math.abs(p - currentPage) <= 1) return true;
              return false;
            })
            .map((p, idx, arr) => {
              const prev = arr[idx - 1];
              const needsEllipsis = prev !== undefined && p - prev > 1;
              return (
                <span key={p} className="inline-flex items-center gap-1">
                  {needsEllipsis && (
                    <span className="px-2 text-sm text-muted-foreground/60">...</span>
                  )}
                  <Link
                    href={`/admin/reviews?page=${p}`}
                    className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium ${
                      p === currentPage
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {p}
                  </Link>
                </span>
              );
            })}
          <Link
            href={currentPage < totalPages ? `/admin/reviews?page=${currentPage + 1}` : "#"}
            className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm ${
              currentPage >= totalPages
                ? "text-muted-foreground/40 pointer-events-none"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <ChevronRight className="size-4" />
          </Link>
        </nav>
      )}
    </div>
  );
}
