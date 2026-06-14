/**
 * @file POST /api/auth/reset — Reset password with token.
 *
 * Validates the reset token, updates the user's password,
 * and deletes the used token.
 */

import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, password } = body;

    if (!token) {
      return NextResponse.json({ error: "缺少重置令牌" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "密码至少需要 6 个字符" },
        { status: 400 },
      );
    }

    // Find the token
    const resetToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: "重置令牌无效" },
        { status: 400 },
      );
    }

    // Check if expired
    if (resetToken.expires < new Date()) {
      await prisma.verificationToken.delete({
        where: { token },
      });
      return NextResponse.json(
        { error: "重置令牌已过期，请重新申请" },
        { status: 400 },
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: resetToken.identifier },
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 },
      );
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Delete the used token
    await prisma.verificationToken.delete({
      where: { token },
    });

    return NextResponse.json({
      message: "密码重置成功",
    });
  } catch (err) {
    console.error("[Reset API] Error:", err);
    return NextResponse.json(
      { error: "重置失败，请稍后重试" },
      { status: 500 },
    );
  }
}
