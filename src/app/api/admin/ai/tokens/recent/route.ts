/**
 * @file GET /api/admin/ai/tokens/recent
 *
 * Returns the most recent AiUsageLog records for display in the admin dashboard.
 *
 * Query params:
 *   - limit (optional, default 50): Number of recent records to return
 *
 * Response:
 *   {
 *     records: Array<{
 *       id, type, promptTokens, completionTokens, totalTokens, createdAt
 *     }>
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.max(1, Math.min(200, parseInt(limitParam, 10) || 50)) : 50;

    const records = await prisma.aiUsageLog.findMany({
      select: {
        id: true,
        type: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ records });
  } catch (error) {
    console.error("Token recent error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
