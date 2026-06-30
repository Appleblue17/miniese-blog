/**
 * @file POST /api/admin/users/[id]/reset-password — Admin resets user's password.
 *
 * Allows admins to reset any user's password to a generated temporary password.
 * The user will be prompted to change it on next login.
 * Requires admin session.
 *
 * Body: { password?: string } — optional custom password, otherwise auto-generated
 * Returns: { message, temporaryPassword }
 */

import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as { roles?: string[] }).roles?.includes("admin")) {
      return NextResponse.json({ error: "未授权" }, { status: 403 });
    }

    const { id } = await params;

    // Check user exists
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // Generate or use provided password
    const body = await request.json().catch(() => ({}));
    const customPassword = body.password as string | undefined;

    const temporaryPassword =
      customPassword && customPassword.length >= 6
        ? customPassword
        : crypto.randomBytes(4).toString("hex") + "Ab1!"; // 8 chars + uppercase + digit + special

    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      message: `用户 ${user.username || user.email} 的密码已重置`,
      temporaryPassword,
    });
  } catch (err) {
    console.error("[Admin Reset Password] Error:", err);
    return NextResponse.json(
      { error: "重置失败，请稍后重试" },
      { status: 500 },
    );
  }
}
