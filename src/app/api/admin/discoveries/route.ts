/**
 * @file /api/admin/discoveries
 *
 * GET  - List WikiDiscovery records (paginated, filterable)
 * POST - Batch approve or reject WikiDiscovery records
 *
 * Batch POST body (approve):
 *   { ids: string[] }
 *   or
 *   { articleId?: string, minImportance?: number, limit?: number, type?: string }
 *
 * Batch POST body (reject):
 *   { ids: string[], action: "reject" }
 *   or
 *   { articleId?: string, minImportance?: number, limit?: number, type?: string, action: "reject" }
 */

import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { buildWikiFileWithMeta, slugifyName } from "@/lib/wiki/parser";
import { addJob } from "@/lib/queue/producer";
import type { WikiBlocks } from "@/lib/wiki/parser";

// ---------------------------------------------------------------------------
// GET - List discoveries
// ---------------------------------------------------------------------------

export interface DiscoveryItem {
  id: string;
  articleId: string | null;
  articleSlug: string;
  articleLang: string;
  term: string;
  type: string;
  definition: string;
  importance: number;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  wikiEntryId: string | null;
  failedReason: string | null;
}

interface DiscoveriesResponse {
  discoveries: DiscoveryItem[];
  total: number;
  page: number;
  totalPages: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const articleIdFilter = searchParams.get("articleId");
    const statusFilter = searchParams.get("status") || "pending";
    const typeFilter = searchParams.get("type");
    const langFilter = searchParams.get("lang");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    // Build where clause
    const where: Record<string, unknown> = {};
    if (
      statusFilter &&
      ["pending", "approved", "rejected", "generated", "failed"].includes(statusFilter)
    ) {
      where.status = statusFilter;
    }
    if (articleIdFilter) {
      where.articleId = articleIdFilter;
    }
    if (typeFilter) {
      where.type = typeFilter;
    }
    if (langFilter && ["zh", "en"].includes(langFilter)) {
      where.articleLang = langFilter;
    }

    // Get total count
    const total = await prisma.wikiDiscovery.count({ where });

    // Get paginated results
    const items = await prisma.wikiDiscovery.findMany({
      where,
      orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    });

    const mapped: DiscoveryItem[] = items.map((d) => ({
      id: d.id,
      articleId: d.articleId,
      articleSlug: d.articleSlug,
      articleLang: d.articleLang,
      term: d.term,
      type: d.type,
      definition: d.definition,
      importance: d.importance,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      approvedAt: d.approvedAt?.toISOString() ?? null,
      wikiEntryId: d.wikiEntryId,
      failedReason: d.failedReason,
    }));

    return NextResponse.json({
      discoveries: mapped,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    } satisfies DiscoveriesResponse);
  } catch (error) {
    console.error("Admin discoveries list error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST - Batch operation
// ---------------------------------------------------------------------------

interface BatchRequest {
  action?: "approve" | "reject";
  ids?: string[];
  articleId?: string;
  minImportance?: number;
  maxImportance?: number;
  limit?: number;
  type?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BatchRequest;
    const action = body.action || "approve";

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'." }, { status: 400 });
    }

    let targetIds: string[] = [];

    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      // By explicit ID list
      targetIds = body.ids;
    } else {
      // By criteria
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = { status: "pending" };
      if (body.articleId) {
        where.articleId = body.articleId;
      }
      if (body.minImportance !== undefined) {
        where.importance = { gte: body.minImportance };
      }
      if (body.maxImportance !== undefined) {
        where.importance = { ...(where.importance || {}), lte: body.maxImportance };
      }
      if (body.type) {
        where.type = body.type;
      }

      const items = await prisma.wikiDiscovery.findMany({
        where,
        orderBy: { importance: "desc" },
        take: body.limit || 9999,
        select: { id: true },
      });

      targetIds = items.map((i) => i.id);
    }

    if (targetIds.length === 0) {
      return NextResponse.json({
        success: true,
        affectedCount: 0,
        message: "No matching records found.",
      });
    }

    // --- For reject: simple batch update ---
    if (action === "reject") {
      const result = await prisma.wikiDiscovery.updateMany({
        where: { id: { in: targetIds } },
        data: { status: "rejected" },
      });

      return NextResponse.json({
        success: true,
        affectedCount: result.count,
        message: `Successfully rejected ${result.count} candidate(s).`,
        enqueuedCount: 0,
      });
    }

    // --- For approve: fetch full records, create WikiEntries, enqueue jobs ---
    const records = await prisma.wikiDiscovery.findMany({
      where: { id: { in: targetIds }, status: "pending" },
    });

    let successCount = 0;
    let enqueuedCount = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        // Check for existing entry
        const existingEntry = await prisma.wikiEntry.findUnique({
          where: {
            name_language: { name: record.term, language: record.articleLang },
          },
        });

        if (existingEntry) {
          errors.push(`"${record.term}" (${record.articleLang}) already exists`);
          continue;
        }

        // Create .md file on disk
        const slug = slugifyName(record.term);
        if (!slug) {
          errors.push(`"${record.term}" — could not generate slug`);
          continue;
        }

        const blocks: WikiBlocks = {
          definition: record.definition || "",
          human: "",
          ai: "",
          ref: "",
        };

        const fileContent = buildWikiFileWithMeta(
          {
            name: record.term,
            language: record.articleLang,
            aliases: [],
            tags: [],
            status: "creating",
            accessGroup: [],
          },
          blocks,
        );

        const contentPath = `content/wiki/${record.articleLang}/${slug}.md`;
        const filePath = path.join(process.cwd(), contentPath);
        const targetDir = path.dirname(filePath);
        await mkdir(targetDir, { recursive: true });
        await writeFile(filePath, fileContent, "utf-8");

        // Create WikiEntry
        const entry = await prisma.wikiEntry.create({
          data: {
            name: record.term,
            aliases: [],
            language: record.articleLang,
            definition: record.definition || "",
            contentPath,
            tags: [],
            accessGroup: [],
            status: "creating",
          },
        });

        // Update discovery
        await prisma.wikiDiscovery.update({
          where: { id: record.id },
          data: {
            status: "approved",
            approvedAt: new Date(),
            wikiEntryId: entry.id,
          },
        });

        // Enqueue generate job
        try {
          await addJob("generate", { discoveryId: record.id });
          enqueuedCount++;
          successCount++;
        } catch (err) {
          // WikiEntry exists but no generate job — user can retry from UI
          console.warn(
            `[Admin] Failed to enqueue generate for discovery ${record.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          errors.push(
            `"${record.term}": WikiEntry created but generate job enqueue failed - ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } catch (err) {
        errors.push(`"${record.term}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const message =
      successCount > 0
        ? `Successfully approved ${successCount} candidate(s) with ${enqueuedCount} generation job(s) enqueued.`
        : "No candidates were approved.";

    return NextResponse.json({
      success: true,
      affectedCount: successCount,
      enqueuedCount,
      message,
      ...(errors.length > 0 ? { errors: errors.slice(0, 10) } : {}),
    });
  } catch (error) {
    console.error("Admin discoveries batch operation error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
