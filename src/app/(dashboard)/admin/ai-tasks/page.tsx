/**
 * @file /admin/ai-tasks - AI 助手任务列表
 *
 * 直接使用 Prisma 查询 AI 任务列表（避免 Server Component fetch 自身 API 的间接调用）。
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { AiTaskList } from "@/components/admin/AiTaskList";
import type { AiTaskItem } from "@/app/api/admin/ai-tasks/route";

export const metadata: Metadata = {
  title: "助手任务 | Miniese's Blog",
};

const PAGE_SIZE = 20;
const VALID_TYPES = ["review", "translate", "generate", "discover"] as const;

export default async function AdminAiTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const activeType =
    params.type && VALID_TYPES.includes(params.type as (typeof VALID_TYPES)[number])
      ? params.type
      : "all";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));

  // ── Build where clause ──
  const where: Record<string, unknown> = {};
  if (activeType !== "all") where.type = activeType;

  // ── Query ──
  const [total, tasks] = await Promise.all([
    prisma.aiTask.count({ where }),
    prisma.aiTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        article: {
          select: { title: true },
        },
      },
    }),
  ]);

  // ── Batch lookup discovery terms for generate tasks ──
  const generateTasks = tasks.filter((t) => t.type === "generate" && !t.articleId);
  const discoveryIds: string[] = [];
  for (const t of generateTasks) {
    const input = (t.input ?? {}) as Record<string, unknown>;
    const did = input.discoveryId as string | undefined;
    if (did) discoveryIds.push(did);
  }

  const discoveries =
    discoveryIds.length > 0
      ? await prisma.wikiDiscovery.findMany({
          where: { id: { in: discoveryIds } },
          select: { id: true, term: true },
        })
      : [];
  const discoveryTermMap = new Map(discoveries.map((d) => [d.id, d.term]));

  // ── Map to AiTaskItem ──
  const mapped: AiTaskItem[] = tasks.map((t) => {
    let articleTitle: string | null = t.article?.title ?? null;

    if (!articleTitle && t.type === "generate") {
      const input = (t.input ?? {}) as Record<string, unknown>;
      const discoveryId = input.discoveryId as string | undefined;
      if (discoveryId) {
        const term = discoveryTermMap.get(discoveryId);
        articleTitle = term ? `词条: ${term}` : `词条(${discoveryId.slice(0, 8)}...)`;
      }
    }

    return {
      id: t.id,
      type: t.type,
      status: t.status,
      input: (t.input ?? {}) as Record<string, unknown>,
      output: t.output as Record<string, unknown> | null,
      error: t.error,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
      articleId: t.articleId,
      articleTitle,
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">助手任务</h1>
          <p className="text-sm text-muted-foreground mt-1">共 {total} 个任务</p>
        </div>
      </div>

      <AiTaskList
        tasks={mapped}
        activeType={activeType}
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </div>
  );
}
