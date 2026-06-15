/**
 * @file PUT /api/admin/notifications/[id]/read — Mark notification as read.
 *
 * Admin-only (protected by proxy.ts).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif) {
      return NextResponse.json({ error: "通知不存在" }, { status: 404 });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return NextResponse.json({ id: updated.id, isRead: updated.isRead });
  } catch (err) {
    console.error("[Admin Notifications] Read error:", err);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
