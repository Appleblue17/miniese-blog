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
import { prisma } from "@/lib/db";

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
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10)),
    );

    // Build where clause
    const where: Record<string, unknown> = {};
    if (statusFilter && ["pending", "approved", "rejected"].includes(statusFilter)) {
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
      orderBy: [
        { importance: "desc" },
        { createdAt: "desc" },
      ],
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
    }));

    return NextResponse.json({
      discoveries: mapped,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    } satisfies DiscoveriesResponse);
  } catch (error) {
    console.error("Admin discoveries list error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
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

    if (![ "approve", "reject" ].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'." },
        { status: 400 },
      );
    }

    let targetIds: string[] = [];

    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      // By explicit ID list
      targetIds = body.ids;
    } else {
      // By criteria
      const where: Record<string, unknown> = { status: "pending" };
      if (body.articleId) {
        where.articleId = body.articleId;
      }
      if (body.minImportance !== undefined) {
        where.importance = { gte: body.minImportance };
      }
      if (body.maxImportance !== undefined) {
        where.importance = { ...(where.importance as Record<string, unknown> || {}), lte: body.maxImportance };
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

    // Perform the batch update
    const result = await prisma.wikiDiscovery.updateMany({
      where: { id: { in: targetIds } },
      data: {
        status: action === "approve" ? "approved" : "rejected",
        ...(action === "approve" ? { approvedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      affectedCount: result.count,
      message: `Successfully ${action === "approve" ? "approved" : "rejected"} ${result.count} candidate(s).`,
    });
  } catch (error) {
    console.error("Admin discoveries batch operation error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
