/**
 * @file /admin/reviews/[reviewId] - AI Review detail page.
 *
 * Shows the full review report including section-grouped issues,
 * chunk metadata (line range, size), and a download source button.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { readFile } from "fs/promises";
import path from "path";
import { ArrowLeft, Bot, AlertCircle, Download } from "lucide-react";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import ReviewChunkList from "@/components/admin/ReviewChunkList";

export const metadata: Metadata = {
  title: "审查报告 | Miniese's Blog",
};

interface ReviewChunk {
  chunkId: number;
  chunkTitle: string;
  startLine: number;
  endLine: number;
  sections: Array<{
    type: string;
    title: string;
    items: Array<{
      severity: string;
      lineStart: number;
      lineEnd: number;
      snippet: string;
      issue: string;
      suggestion: string;
    }>;
  }>;
}

interface ReviewOutput {
  articleId: string;
  version: string;
  reviewedAt: string;
  chunks: ReviewChunk[];
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    suggestions: number;
  };
}

interface ReviewDetail {
  id: string;
  type: string;
  status: string;
  input: Record<string, unknown>;
  output: ReviewOutput | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

async function fetchReview(reviewId: string): Promise<ReviewDetail | null> {
  try {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/admin/reviews/${reviewId}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.task;
  } catch {
    return null;
  }
}

async function fetchSourceContent(
  articleId: string,
): Promise<{ content: string; fileName: string } | null> {
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { contentPath: true, title: true },
    });
    if (!article) return null;
    const filePath = path.join(process.cwd(), article.contentPath);
    const content = await readFile(filePath, "utf-8");
    const fileName = article.contentPath.split("/").pop() || `${article.title}.md`;
    return { content, fileName };
  } catch {
    return null;
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
    failed: { label: "失败", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  };
  const c = config[status] ?? { label: status, color: "bg-slate-100 text-slate-700" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.color}`}
    >
      {c.label}
    </span>
  );
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const review = await fetchReview(reviewId);

  if (!review) {
    notFound();
  }

  const output = review.output;
  const articleId = (review.input?.articleId as string) ?? null;
  const source = articleId ? await fetchSourceContent(articleId) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin/reviews"
          className="inline-flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">审查报告</h1>
            <StatusBadge status={review.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {review.type} · 创建于 {formatDate(review.createdAt)}
            {review.completedAt && ` · 完成于 ${formatDate(review.completedAt)}`}
          </p>
        </div>
        {/* Download source button */}
        {source && (
          <a
            href={`/api/articles/content?id=${articleId}&download=1`}
            download={source.fileName}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Download className="size-3.5" />
            下载源文件
          </a>
        )}
      </div>

      {/* Error state */}
      {review.status === "failed" && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-red-800 dark:text-red-200">审查失败</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {review.error || "未知错误"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending / Processing state */}
      {(review.status === "pending" || review.status === "processing") && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 p-4">
          <div className="flex items-start gap-3">
            <Bot className="size-5 text-blue-500 shrink-0 mt-0.5 animate-pulse" />
            <div>
              <p className="font-medium text-sm text-blue-800 dark:text-blue-200">
                审查正在{review.status === "pending" ? "等待" : "处理"}中
              </p>
              {(() => {
                if (review.status === "processing" && output) {
                  const rawOutput = output as unknown as Record<string, unknown>;
                  const progress = rawOutput.progress as
                    | { totalChunks?: number; processedChunks?: number }
                    | undefined;
                  if (
                    progress &&
                    typeof progress.totalChunks === "number" &&
                    typeof progress.processedChunks === "number"
                  ) {
                    const pct = Math.round((progress.processedChunks / progress.totalChunks) * 100);
                    return (
                      <>
                        <div className="mt-2">
                          <div className="h-1.5 w-full rounded-full bg-blue-200 dark:bg-blue-800 overflow-hidden max-w-xs">
                            <div
                              className="h-full rounded-full bg-blue-500 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                            已处理 {progress.processedChunks}/{progress.totalChunks} 个段落
                          </p>
                        </div>
                        <a
                          href={`/admin/reviews/${reviewId}`}
                          className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-500 mt-2 inline-block"
                        >
                          刷新页面
                        </a>
                      </>
                    );
                  }
                  return (
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                      正在分析段落内容...
                    </p>
                  );
                }
                return (
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                    等待 Worker 处理，请稍后刷新页面查看最新结果。
                  </p>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {output?.summary && (
        <div className="grid grid-cols-4 gap-3 mb-8">
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-2xl font-bold">{output.summary.totalIssues}</p>
            <p className="text-xs text-muted-foreground mt-1">问题总数</p>
          </div>
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-card p-4 text-center">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {output.summary.errors}
            </p>
            <p className="text-xs text-muted-foreground mt-1">错误</p>
          </div>
          <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-card p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {output.summary.warnings}
            </p>
            <p className="text-xs text-muted-foreground mt-1">警告</p>
          </div>
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-card p-4 text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {output.summary.suggestions}
            </p>
            <p className="text-xs text-muted-foreground mt-1">建议</p>
          </div>
        </div>
      )}

      {/* Chunk details — delegated to client component */}
      {output?.chunks && output.chunks.length > 0 && <ReviewChunkList chunks={output.chunks} />}

      {/* Raw output link for debugging */}
      {output && (
        <details className="mt-8">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            查看原始 JSON 输出
          </summary>
          <pre className="mt-2 text-xs bg-muted rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto">
            {JSON.stringify(output, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
