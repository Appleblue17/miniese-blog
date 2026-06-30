/**
 * @file PUT /api/auth/update-profile — Update user profile.
 *
 * Requires authentication. Updates the user's display name.
 * Username is set at registration and cannot be changed here.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name } = body;

    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "昵称不能为空" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { name: name.trim() },
    });

    return NextResponse.json({ message: "昵称已更新" });
  } catch (err) {
    console.error("[Update Profile API] Error:", err);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}
