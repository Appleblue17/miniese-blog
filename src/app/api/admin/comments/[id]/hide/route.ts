/**
 * @file PUT /api/admin/comments/[id]/hide — Toggle comment visibility.
 *
 * Admin-only (protected by proxy.ts).
 * Body: { hidden: boolean }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { hidden } = body;

    if (typeof hidden !== "boolean") {
      return NextResponse.json({ error: "参数 hidden 必须为布尔值" }, { status: 400 });
    }

    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    }

    const updated = await prisma.comment.update({
      where: { id },
      data: { isHidden: hidden },
    });

    return NextResponse.json({
      id: updated.id,
      isHidden: updated.isHidden,
    });
  } catch (err) {
    console.error("[Admin Comments] Hide error:", err);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
