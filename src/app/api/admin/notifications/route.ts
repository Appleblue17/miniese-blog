/**
 * @file GET /api/admin/notifications — Admin notifications list.
 *
 * Returns all notifications, newest first.
 * Admin-only (protected by proxy.ts).
 *
 * Query params:
 *   page  - page number (default 1)
 *   limit - items per page (default 20)
 *   unreadOnly - if "true", only return unread notifications
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  const where = unreadOnly ? { isRead: false } : {};

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { isRead: false } }),
  ]);

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      content: n.content,
      articleId: n.articleId,
      articleTitle: n.articleTitle,
      taskId: n.taskId,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
