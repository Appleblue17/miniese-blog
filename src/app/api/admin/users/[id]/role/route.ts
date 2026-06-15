/**
 * @file PUT /api/admin/users/[id]/role — Add or remove a role for a user.
 *
 * Admin-only (protected by proxy.ts).
 * Body: { action: "add" | "remove", role: string }
 *
 * Examples:
 *   { action: "add", role: "admin" }    → Grant admin role
 *   { action: "remove", role: "admin" } → Revoke admin role
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
    const { action, role } = body;

    if (!action || !role || typeof role !== "string") {
      return NextResponse.json(
        { error: "缺少参数 action 或 role" },
        { status: 400 },
      );
    }

    if (action !== "add" && action !== "remove") {
      return NextResponse.json({ error: "action 必须为 add 或 remove" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    let newRoles: string[];
    if (action === "add") {
      if (user.roles.includes(role)) {
        return NextResponse.json({ error: "用户已有该角色" }, { status: 409 });
      }
      newRoles = [...user.roles, role];
    } else {
      if (!user.roles.includes(role)) {
        return NextResponse.json({ error: "用户没有该角色" }, { status: 409 });
      }
      newRoles = user.roles.filter((r) => r !== role);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { roles: newRoles },
      select: { id: true, email: true, name: true, roles: true },
    });

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      roles: updated.roles,
    });
  } catch (err) {
    console.error("[Admin Users] Role update error:", err);
    return NextResponse.json({ error: "更新角色失败" }, { status: 500 });
  }
}
