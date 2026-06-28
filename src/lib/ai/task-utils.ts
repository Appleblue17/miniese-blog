/**
 * @file src/lib/ai/task-utils.ts
 *
 * Shared utilities for querying and mapping AI task records.
 * Used by both the page component (Server Component) and the API route.
 */

import { prisma } from "@/lib/db";
import type { AiTask } from "../../generated/prisma/client";

/**
 * Valid AI task types used for filtering.
 */
export const VALID_TYPES = ["review", "translate", "generate", "discover"] as const;
export type ValidTaskType = (typeof VALID_TYPES)[number];

/**
 * The shape of a mapped AI task item returned to the UI.
 * Shared between Server Component page and API route.
 */
export interface AiTaskItem {
  id: string;
  type: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  articleId: string | null;
  articleTitle: string | null;
}

/**
 * Query tasks with optional filters, returns both total count and paginated results.
 */
export async function queryTasks(params: {
  type?: string;
  articleId?: string;
  page?: number;
  limit?: number;
}): Promise<{ tasks: AiTaskItem[]; total: number; page: number; totalPages: number }> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (params.type) {
    where.type = params.type;
  }

  if (params.articleId) {
    where.articleId = params.articleId;
  }

  const [total, tasks] = await Promise.all([
    prisma.aiTask.count({ where }),
    prisma.aiTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        article: {
          select: { title: true },
        },
      },
    }),
  ]);

  const mapped = await mapTasksToItems(tasks);

  return {
    tasks: mapped,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Map raw Prisma AiTask records to AiTaskItem for the UI.
 * Handles:
 * - Discovery term name lookup for generate tasks
 * - "completed + skipped" -> "skipped" status mapping
 */
export async function mapTasksToItems(
  tasks: Array<AiTask & { article?: { title: string } | null }>,
): Promise<AiTaskItem[]> {
  // Batch lookup discovery term names for generate tasks without article
  const generateTasks = tasks.filter((t) => t.type === "generate" && !t.articleId);
  const discoveryIds: string[] = [];

  for (const t of generateTasks) {
    const input = (t.input ?? {}) as Record<string, unknown>;
    const discoveryId = input.discoveryId as string | undefined;
    if (discoveryId) {
      discoveryIds.push(discoveryId);
    }
  }

  const discoveries =
    discoveryIds.length > 0
      ? await prisma.wikiDiscovery.findMany({
          where: { id: { in: discoveryIds } },
          select: { id: true, term: true },
        })
      : [];

  const discoveryTermMap = new Map(discoveries.map((d) => [d.id, d.term]));

  // Map each task
  return tasks.map((t) => {
    const output = t.output as Record<string, unknown> | null;
    let articleTitle: string | null = t.article?.title ?? null;

    // For generate tasks without article, show the term name from input discovery
    if (!articleTitle && t.type === "generate") {
      const input = (t.input ?? {}) as Record<string, unknown>;
      const discoveryId = input.discoveryId as string | undefined;
      if (discoveryId) {
        const term = discoveryTermMap.get(discoveryId);
        articleTitle = term ? `词条: ${term}` : `词条(${discoveryId.slice(0, 8)}...)`;
      }
    }

    // Map "completed + skipped" to a display status of "skipped"
    const displayStatus =
      t.status === "completed" && output?.skipped === true ? "skipped" : t.status;

    return {
      id: t.id,
      type: t.type,
      status: displayStatus,
      input: (t.input ?? {}) as Record<string, unknown>,
      output,
      error: t.error,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
      articleId: t.articleId,
      articleTitle,
    };
  });
}

/**
 * Validate that a type filter string is one of the valid task types.
 * Returns the validated type or null if invalid.
 */
export function validateTaskType(type: string | null): string | null {
  if (!type) return null;
  return VALID_TYPES.includes(type as ValidTaskType) ? type : null;
}
