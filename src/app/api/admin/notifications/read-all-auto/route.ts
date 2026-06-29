/**
 * @file PUT /api/admin/notifications/read-all-auto — Mark all 🔵 (autoRead) notifications as read.
 *
 * Called on page load to auto-read translation_complete and discovery notifications.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT() {
  try {
    await prisma.notification.updateMany({
      where: {
        isRead: false,
        type: { in: ["translation_complete", "discovery"] },
      },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Admin] Failed to mark auto-read notifications:", err);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
