/**
 * @file /admin/ai-tasks/[taskId] - AI 任务详情页
 *
 * 显示 AI 任务的详细信息，支持审查、翻译、生成词条等不同类型的输出展示。
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { readFile } from "fs/promises";
import path from "path";
import {
  ArrowLeft,
  Bot,
  AlertCircle,
  Download,
  Globe,
  Sparkles,
  Search,
  Library,
  CheckCircle2,
  Edit,
} from "lucide-react";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import ReviewChunkList from "@/components/admin/ReviewChunkList";
import TranslateChunkList from "@/components/admin/TranslateChunkList";
import { stripFrontmatter } from "@/lib/ai/chunker/chunker";

export const metadata: Metadata = {
  title: "任务详情 | Miniese's Blog",
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

interface TranslateGroup {
  /** Line range of the target in the new content (1-based, inclusive) */
  targetLines: [number, number];
  /** Context window line range (inclusive) */
  contextLines: [number, number];
}

interface TranslateOutput {
  translatedCount: number;
  reusedCount: number;
  totalTokensUsed: number;
  translations: Record<string, string>;
  translatedContent?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  /** Groups sent to AI for translation, with line-level ranges */
  translatedGroups?: TranslateGroup[];
}

interface GenerateOutput {
  discoveryId: string;
  term: string;
  wikiEntryId: string;
  success: boolean;
  message: string;
  reason?: string;
}

interface DiscoverOutput {
  candidateCount: number;
  candidates: Array<{
    term: string;
    type: string;
    definition: string;
    importance: number;
  }>;
}

interface TaskDetail {
  id: string;
  type: string;
  status: string;
  input: Record<string, unknown>;
  output: ReviewOutput | TranslateOutput | GenerateOutput | DiscoverOutput | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  articleId: string | null;
  articleTitle: string | null;
}

async function fetchTask(taskId: string): Promise<TaskDetail | null> {
  try {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/admin/ai-tasks?page=1&limit=1`, {
      cache: "no-store",
    });
    if (!res.ok) return null;

    // Fetch individual task via status API
    const statusRes = await fetch(`${baseUrl}/api/ai/status/${taskId}`, {
      cache: "no-store",
    });
    if (!statusRes.ok) return null;
    return statusRes.json();
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

function TaskTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "review":
      return <Bot className="size-5 text-muted-foreground" />;
    case "translate":
      return <Globe className="size-5 text-blue-500" />;
    case "generate":
      return <Sparkles className="size-5 text-purple-500" />;
    case "discover":
      return <Sparkles className="size-5 text-amber-500" />;
    default:
      return <Bot className="size-5 text-muted-foreground" />;
  }
}

function TaskTypeLabel({ type }: { type: string }) {
  switch (type) {
    case "review":
      return "AI 审查";
    case "translate":
      return "AI 翻译";
    case "generate":
      return "词条生成";
    case "discover":
      return "词条发现";
    default:
      return type;
  }
}

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;

  // Fetch task directly from DB (Server Component, no fetch caching)
  let task: TaskDetail | null = null;
  try {
    const dbTask = await prisma.aiTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        type: true,
        status: true,
        input: true,
        output: true,
        error: true,
        createdAt: true,
        completedAt: true,
        articleId: true,
      },
    });

    if (dbTask) {
      task = {
        id: dbTask.id,
        type: dbTask.type,
        status: dbTask.status,
        input: (dbTask.input ?? {}) as Record<string, unknown>,
        output: dbTask.output as ReviewOutput | TranslateOutput | GenerateOutput | null,
        error: dbTask.error,
        createdAt: dbTask.createdAt.toISOString(),
        completedAt: dbTask.completedAt?.toISOString() ?? null,
        articleId: dbTask.articleId,
        articleTitle: null,
      };
    }
  } catch {
    task = null;
  }

  if (!task) {
    notFound();
  }

  const output = task.output;
  const articleId = (task.input?.articleId as string) ?? task.articleId;
  const source = articleId ? await fetchSourceContent(articleId) : null;

  const isReview = task.type === "review";
  const isTranslate = task.type === "translate";
  const isGenerate = task.type === "generate";
  const isDiscover = task.type === "discover";
  const reviewOutput = isReview ? (output as ReviewOutput | null) : null;
  const translateOutput = isTranslate ? (output as TranslateOutput | null) : null;
  const generateOutput = isGenerate ? (output as GenerateOutput | null) : null;
  const discoverOutput = isDiscover ? (output as DiscoverOutput | null) : null;

  // Build translate chunks for the TranslateChunkList component.
  //
  // For incremental mode (translatedGroups present): each group creates a
  // single chunk showing the target diff, with above/below context embedded.
  // For full translation mode: show the entire article as a single chunk.
  let translateChunks: Array<{
    chunkId: number;
    title: string;
    sourceText: string;
    translatedText: string;
    reused: boolean;
    context: boolean;
    startLine: number;
    endLine: number;
    hasContext?: boolean;
    aboveContext?: string;
    belowContext?: string;
  }> | null = null;

  if (isTranslate && translateOutput?.translations && source?.content) {
    const body = stripFrontmatter(source.content);
    const lines = body.split("\n");
    const translations = translateOutput.translations as Record<string, string>;
    const groups = translateOutput.translatedGroups as TranslateGroup[];

    if (groups && groups.length > 0) {
      // ── Incremental mode: target chunk with embedded context ──
      //
      // For each group, split contextLines into three parts:
      //   above = lines before targetLines
      //   target = targetLines (the actual diff)
      //   below = lines after targetLines

      translateChunks = [];

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const [ts, te] = group.targetLines;
        const [cs, ce] = group.contextLines;

        const targetStart = Math.max(1, ts);
        const targetEnd = Math.min(lines.length, te);
        const contextStart = Math.max(1, cs);
        const contextEnd = Math.min(lines.length, ce);

        if (targetStart > targetEnd) continue;

        // Extract target content and find translation
        const targetContent = lines.slice(targetStart - 1, targetEnd).join("\n");
        let translatedContent = translations[targetContent];

        // If no exact match, search as contiguous block within larger keys
        if (translatedContent === undefined) {
          const targetLinesArr = targetContent.split("\n");
          for (const [srcKey, tKey] of Object.entries(translations)) {
            const srcLines = srcKey.split("\n");
            const tLines = tKey.split("\n");
            for (let j = 0; j + targetLinesArr.length <= srcLines.length; j++) {
              if (srcLines.slice(j, j + targetLinesArr.length).join("\n") === targetContent) {
                translatedContent = tLines.slice(j, j + targetLinesArr.length).join("\n");
                break;
              }
            }
            if (translatedContent !== undefined) break;
          }
        }

        // Extract above/below context (lines in contextLines but not targetLines)
        let aboveContext: string | undefined;
        let belowContext: string | undefined;

        if (contextStart < targetStart) {
          const above = lines.slice(contextStart - 1, targetStart - 1);
          if (above.length > 0) {
            aboveContext = above.join("\n");
          }
        }
        if (contextEnd > targetEnd) {
          const below = lines.slice(targetEnd, contextEnd);
          if (below.length > 0) {
            belowContext = below.join("\n");
          }
        }

        const firstLine = lines.slice(targetStart - 1, targetEnd).find((l) => l.trim().length > 0);
        const title = firstLine
          ? firstLine.trim().substring(0, 60)
          : `行 ${targetStart}–${targetEnd}`;

        translateChunks.push({
          chunkId: i,
          title,
          sourceText: targetContent,
          translatedText: translatedContent ?? targetContent,
          reused: false,
          context: false,
          startLine: targetStart,
          endLine: targetEnd,
          hasContext: !!(aboveContext || belowContext),
          aboveContext,
          belowContext,
        });
      }
    } else {
      // ── Full translation mode ──
      // Show entire article as a single chunk.
      const translatedContent = translations[body] ?? body;
      const firstLine = lines.find((l) => l.trim().length > 0);
      translateChunks = [
        {
          chunkId: 0,
          title: firstLine?.trim().substring(0, 60) ?? "全文",
          sourceText: body,
          translatedText: translatedContent,
          reused: translatedContent === body,
          context: false,
          startLine: 1,
          endLine: lines.length,
        },
      ];
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin/ai-tasks"
          className="inline-flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <TaskTypeIcon type={task.type} />
            <h1 className="text-2xl font-bold tracking-tight">
              <TaskTypeLabel type={task.type} />
            </h1>
            <StatusBadge status={task.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {task.articleTitle && `文章: ${task.articleTitle} · `}
            创建于 {formatDate(task.createdAt)}
            {task.completedAt && ` · 完成于 ${formatDate(task.completedAt)}`}
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
      {task.status === "failed" && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-red-800 dark:text-red-200">任务失败</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {task.error || "未知错误"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending / Processing state */}
      {(task.status === "pending" || task.status === "processing") && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 p-4">
          <div className="flex items-start gap-3">
            <Bot className="size-5 text-blue-500 shrink-0 mt-0.5 animate-pulse" />
            <div>
              <p className="font-medium text-sm text-blue-800 dark:text-blue-200">
                任务正在{task.status === "pending" ? "等待" : "处理"}中
              </p>
              {task.status === "processing" &&
                isTranslate &&
                (() => {
                  const rawOutput = output as unknown as Record<string, unknown> | null;
                  const progress = rawOutput?.progress as
                    | { totalChunks?: number; processedChunks?: number }
                    | undefined;
                  if (
                    progress &&
                    typeof progress.totalChunks === "number" &&
                    progress.totalChunks > 0 &&
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
                            已翻译 {progress.processedChunks}/{progress.totalChunks} 个段落
                          </p>
                        </div>
                        <Link
                          href={`/admin/ai-tasks/${taskId}`}
                          className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-500 mt-2 inline-block"
                        >
                          刷新页面
                        </Link>
                      </>
                    );
                  }
                  return (
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                      正在分析段落内容...
                    </p>
                  );
                })()}
              {(!isTranslate || task.status === "pending") && (
                <>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                    等待 Worker 处理，请稍后刷新页面查看最新结果。
                  </p>
                  <Link
                    href={`/admin/ai-tasks/${taskId}`}
                    className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-500 mt-2 inline-block"
                  >
                    刷新页面
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary cards for review tasks */}
      {reviewOutput?.summary && (
        <div className="grid grid-cols-4 gap-3 mb-8">
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-2xl font-bold">{reviewOutput.summary.totalIssues}</p>
            <p className="text-xs text-muted-foreground mt-1">问题总数</p>
          </div>
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-card p-4 text-center">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {reviewOutput.summary.errors}
            </p>
            <p className="text-xs text-muted-foreground mt-1">错误</p>
          </div>
          <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-card p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {reviewOutput.summary.warnings}
            </p>
            <p className="text-xs text-muted-foreground mt-1">警告</p>
          </div>
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-card p-4 text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {reviewOutput.summary.suggestions}
            </p>
            <p className="text-xs text-muted-foreground mt-1">建议</p>
          </div>
        </div>
      )}

      {/* Translation summary */}
      {translateOutput && task.status === "completed" && (
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-2xl font-bold">{translateOutput.translatedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">翻译段落</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-2xl font-bold">{translateOutput.reusedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">复用段落</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-2xl font-bold">{translateOutput.totalTokensUsed}</p>
            <p className="text-xs text-muted-foreground mt-1">使用 Tokens</p>
          </div>
        </div>
      )}

      {/* Term generation summary */}
      {generateOutput && task.status === "completed" && (
        <div className="mb-8">
          <div className="rounded-lg border border-border bg-card p-4 inline-flex items-center gap-3">
            {generateOutput.success ? (
              <>
                <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
                  <CheckCircle2 className="size-5 text-green-500" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-green-700 dark:text-green-400">
                    生成成功
                  </p>
                  <p className="text-sm text-muted-foreground">{generateOutput.message}</p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-2">
                  <AlertCircle className="size-5 text-red-500" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-red-700 dark:text-red-400">生成失败</p>
                  <p className="text-sm text-muted-foreground">{generateOutput.message}</p>
                </div>
              </>
            )}
          </div>

          {/* Links */}
          {generateOutput.success && (
            <div className="mt-4 flex items-center gap-3">
              <Link
                href={`/admin/wiki/${generateOutput.wikiEntryId}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                <Edit className="size-4" />
                编辑词条
              </Link>
              <Link
                href={`/admin/wiki?status=unreviewed`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                <Library className="size-4" />
                查看待审查词条
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Discovery summary */}
      {discoverOutput && task.status === "completed" && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <Sparkles className="size-5 text-amber-500" />
              词条发现结果
            </h2>
            <Link
              href="/admin/wiki?status=pending"
              className="text-xs text-primary hover:underline underline-offset-2"
            >
              查看候选词条 →
            </Link>
          </div>

          {/* Stat card */}
          <div className="rounded-lg border border-border bg-card p-4 mb-4 inline-flex items-center gap-4">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-2">
              <Sparkles className="size-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{discoverOutput.candidateCount}</p>
              <p className="text-xs text-muted-foreground">候选词条</p>
            </div>
          </div>

          {/* Candidate cards */}
          {discoverOutput.candidates.length > 0 && (
            <div className="flex flex-col gap-2">
              {discoverOutput.candidates.map((candidate, idx) => {
                const pct = Math.round(candidate.importance * 100);
                const typeLabel = (t: string) => {
                  switch (t) {
                    case "acronym":
                      return "缩写";
                    case "concept":
                      return "概念";
                    case "theorem":
                      return "定理";
                    case "tech":
                      return "技术";
                    default:
                      return t;
                  }
                };
                const typeColor = (t: string) => {
                  switch (t) {
                    case "acronym":
                      return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
                    case "concept":
                      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
                    case "theorem":
                      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
                    case "tech":
                      return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300";
                    default:
                      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                  }
                };

                return (
                  <div
                    key={idx}
                    className="rounded-lg border border-border bg-card px-5 py-4 hover:border-muted-foreground/30 hover:bg-accent/30 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Term name + type badge + lang (matching wiki management style) */}
                        <div className="flex items-center gap-2 mb-2">
                          <Library className="size-4 text-muted-foreground shrink-0" />
                          <span className="font-semibold text-sm">{candidate.term}</span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${typeColor(candidate.type)}`}
                          >
                            {typeLabel(candidate.type)}
                          </span>
                        </div>

                        {/* Definition as "简要解释" */}
                        {candidate.definition && (
                          <div className="flex flex-col gap-0.5 mb-1">
                            <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                              简要解释
                            </span>
                            <p className="text-sm text-foreground leading-relaxed">
                              {candidate.definition}
                            </p>
                          </div>
                        )}
                        {!candidate.definition && (
                          <p className="text-xs text-muted-foreground/40 italic">暂无定义</p>
                        )}
                      </div>

                      {/* Importance — circular + label */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <div className="relative size-10">
                          <svg className="size-10 -rotate-90" viewBox="0 0 36 36">
                            <circle
                              cx="18"
                              cy="18"
                              r="16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              className="text-slate-200 dark:text-slate-700"
                            />
                            <circle
                              cx="18"
                              cy="18"
                              r="16"
                              fill="none"
                              strokeWidth="3"
                              strokeDasharray={`${(pct / 100) * 100.53} 100.53`}
                              strokeLinecap="round"
                              className={
                                pct >= 90
                                  ? "stroke-green-500"
                                  : pct >= 70
                                    ? "stroke-blue-500"
                                    : pct >= 50
                                      ? "stroke-yellow-500"
                                      : "stroke-slate-400"
                              }
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-medium">
                            {pct}%
                          </span>
                        </div>
                        <span className="text-[9px] text-muted-foreground/60">重要性</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Review chunk details */}
      {reviewOutput?.chunks && reviewOutput.chunks.length > 0 && (
        <ReviewChunkList chunks={reviewOutput.chunks} />
      )}

      {/* Translation chunk details */}
      {translateChunks && translateChunks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold tracking-tight mb-4 flex items-center gap-2">
            <Globe className="size-5 text-blue-500" />
            逐段翻译详情
          </h2>
          <TranslateChunkList
            chunks={translateChunks}
            sourceLanguage={
              (translateOutput?.sourceLanguage as string) ??
              (task.input?.sourceLanguage as string) ??
              "zh"
            }
            targetLanguage={
              (translateOutput?.targetLanguage as string) ??
              (task.input?.targetLanguage as string) ??
              "en"
            }
          />
        </div>
      )}

      {/* Raw output link for debugging */}
      {output && (
        <details className="mt-8">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            查看原始输出
          </summary>
          <pre className="mt-2 text-xs bg-muted rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto">
            {JSON.stringify(output, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
