/**
 * @file GET /api/admin/ai/tokens/summary
 *
 * Returns aggregated token usage data for the dashboard:
 * - Current month total, previous month total
 * - Per-type breakdown for current month
 * - Daily usage for the last 30 days (for charting)
 *
 * Query params:
 *   - days (optional, default 30): Number of days to include in daily breakdown
 *
 * Response:
 *   {
 *     currentMonth: { total: number, promptTokens: number, completionTokens: number },
 *     previousMonth: { total: number } | null,
 *     perType: Array<{ type: string, total: number, percentage: number }>,
 *     dailyUsage: Array<{ date: string, total: number }>,
 *     thisMonthTotal: number
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const daysParam = url.searchParams.get("days");
    const days = daysParam ? Math.max(1, Math.min(365, parseInt(daysParam, 10) || 30)) : 30;

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thirtyDaysAgo = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // 1. Current month total
    const [currentMonthAgg] = await prisma.$queryRaw<
      Array<{ prompt_tokens: bigint; completion_tokens: bigint; total_tokens: bigint }>
    >`
      SELECT
        COALESCE(SUM("promptTokens"), 0) as prompt_tokens,
        COALESCE(SUM("completionTokens"), 0) as completion_tokens,
        COALESCE(SUM("totalTokens"), 0) as total_tokens
      FROM "AiUsageLog"
      WHERE "createdAt" >= ${currentMonthStart}
    `;

    const currentMonth = {
      total: Number(currentMonthAgg?.total_tokens ?? 0),
      promptTokens: Number(currentMonthAgg?.prompt_tokens ?? 0),
      completionTokens: Number(currentMonthAgg?.completion_tokens ?? 0),
    };

    // 2. Previous month total
    const [previousMonthAgg] = await prisma.$queryRaw<
      Array<{ total_tokens: bigint }>
    >`
      SELECT COALESCE(SUM("totalTokens"), 0) as total_tokens
      FROM "AiUsageLog"
      WHERE "createdAt" >= ${previousMonthStart}
        AND "createdAt" < ${currentMonthStart}
    `;

    const previousMonth = Number(previousMonthAgg?.total_tokens ?? 0) > 0
      ? { total: Number(previousMonthAgg.total_tokens) }
      : null;

    // 3. Per-type breakdown for current month
    const perTypeAgg = await prisma.aiUsageLog.groupBy({
      by: ["type"],
      _sum: { totalTokens: true },
      where: { createdAt: { gte: currentMonthStart } },
    });

    const currentMonthTotal = currentMonth.total;
    const perType = perTypeAgg.map((t) => ({
      type: t.type,
      total: t._sum.totalTokens ?? 0,
      percentage: currentMonthTotal > 0
        ? Math.round(((t._sum.totalTokens ?? 0) / currentMonthTotal) * 10000) / 100
        : 0,
    }));

    // 4. Daily usage for the last N days
    const dailyAgg = await prisma.$queryRaw<
      Array<{
        date: string;
        total: bigint;
      }>
    >`
      SELECT
        DATE("createdAt") as date,
        COALESCE(SUM("totalTokens"), 0) as total
      FROM "AiUsageLog"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY DATE("createdAt") ASC
    `;

    const dailyUsage = dailyAgg.map((d) => ({
      date: d.date,
      total: Number(d.total),
    }));

    return NextResponse.json({
      currentMonth,
      previousMonth,
      perType,
      dailyUsage,
      thisMonthTotal: currentMonthTotal,
    });
  } catch (error) {
    console.error("Token summary error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
