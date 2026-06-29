/**
 * @file PUT /api/admin/notifications/read-all — Mark all 🔴🟡 notifications as read.
 *
 * 🔵 (notice) level notifications are auto-read on page visit and not included here.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function PUT() {
  const session = await auth();
  const roles = (session?.user as { roles?: string[] })?.roles || [];
  if (!session?.user || !roles.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.notification.updateMany({
      where: {
        isRead: false,
        type: { notIn: ["translation_complete", "discovery"] },
      },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Admin] Failed to mark all as read:", err);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
