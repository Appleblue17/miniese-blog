/**
 * @file POST /api/admin/ai/check-tokens
 *
 * Checks monthly token usage and creates notifications when thresholds
 * are exceeded. Designed to be called by an external cron service.
 *
 * Thresholds and limit are read from site settings (`ai.monthlyTokenLimit`,
 * `ai.warningThreshold`, `ai.criticalThreshold`).
 *
 * Response:
 *   {
 *     month: "YYYY-MM",
 *     totalTokens: number,
 *     limit: number,
 *     usagePercent: number,
 *     level: "ok" | "warning" | "critical",
 *     notificationCreated: boolean,
 *     notificationSkippedReason?: string
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notifyAndMail } from "@/lib/notifications";
import { getSettings } from "@/../config/settings";

export async function POST(_request: NextRequest) {
  try {
    // Load thresholds from settings
    const settings = await getSettings();
    const {
      monthlyTokenLimit = 10_000_000,
      warningThreshold = 0.7,
      criticalThreshold = 0.9,
    } = settings.ai ?? {};

    // Calculate current month
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const monthPrefix = `${year}-${month}`;
    const startOfMonth = new Date(year, now.getMonth(), 1);
    const startOfNextMonth = new Date(year, now.getMonth() + 1, 1);

    // Get current month's token usage via raw SQL for aggregate
    const [usageResult] = await prisma.$queryRaw<
      Array<{ total_tokens: bigint | null; count: bigint }>
    >`
      SELECT COALESCE(SUM("totalTokens"), 0) as total_tokens,
             COUNT(*) as count
      FROM "AiUsageLog"
      WHERE "createdAt" >= ${startOfMonth}
        AND "createdAt" < ${startOfNextMonth}
    `;

    const totalTokens = Number(usageResult?.total_tokens ?? 0);
    const usagePercent = totalTokens / monthlyTokenLimit;
    const logCount = Number(usageResult?.count ?? 0);

    let level: "ok" | "warning" | "critical" = "ok";
    let notificationCreated = false;

    if (usagePercent >= criticalThreshold) {
      level = "critical";
      // Check if a critical notification already exists this month
      const existingCritical = await prisma.notification.findFirst({
        where: {
          type: "token_usage",
          title: { contains: `Token 用量告警（${monthPrefix}` },
          createdAt: { gte: startOfMonth },
        },
      });

      if (!existingCritical) {
        await notifyAndMail({
          type: "task_failed", // reuse task_failed email level for critical alerts
          title: `Token 用量告警（${monthPrefix}）- 严重`,
          content: `本月 AI Token 用量已达 ${totalTokens.toLocaleString()}（${(usagePercent * 100).toFixed(1)}%），` +
            `超过月度限额的 ${Math.round(criticalThreshold * 100)}%。请检查使用情况。`,
        });
        notificationCreated = true;
      }
    } else if (usagePercent >= warningThreshold) {
      level = "warning";
      // Check if a warning notification already exists this month
      const existingWarning = await prisma.notification.findFirst({
        where: {
          type: "token_usage",
          title: { contains: `Token 用量提醒（${monthPrefix}` },
          createdAt: { gte: startOfMonth },
        },
      });

      if (!existingWarning) {
        await notifyAndMail({
          type: "translation_complete", // lower email priority
          title: `Token 用量提醒（${monthPrefix}）- 警告`,
          content: `本月 AI Token 用量已达 ${totalTokens.toLocaleString()}（${(usagePercent * 100).toFixed(1)}%），` +
            `超过月度限额的 ${Math.round(warningThreshold * 100)}%。请留意使用情况。`,
        });
        notificationCreated = true;
      }
    }

    return NextResponse.json({
      month: monthPrefix,
      totalTokens,
      limit: monthlyTokenLimit,
      usagePercent: Math.round(usagePercent * 10000) / 100, // percentage with 2 decimals
      level,
      notificationCreated,
      count: logCount,
    });
  } catch (error) {
    console.error("Token check error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
