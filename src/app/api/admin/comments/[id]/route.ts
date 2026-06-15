/**
 * @file DELETE /api/admin/comments/[id] — Delete a comment.
 *
 * Admin-only (protected by proxy.ts).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    }

    await prisma.comment.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Admin Comments] Delete error:", err);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
