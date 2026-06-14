/**
 * @file GET /api/auth/verify — Email verification.
 *
 * Validates the verification token, updates user's emailVerified field,
 * and deletes the used token.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "缺少验证令牌" },
        { status: 400 },
      );
    }

    // Find the verification token
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return NextResponse.json(
        { error: "验证令牌无效" },
        { status: 400 },
      );
    }

    // Check if expired
    if (verificationToken.expires < new Date()) {
      await prisma.verificationToken.delete({
        where: { token },
      });
      return NextResponse.json(
        { error: "验证令牌已过期，请重新注册" },
        { status: 400 },
      );
    }

    // Update user's emailVerified
    const user = await prisma.user.findUnique({
      where: { email: verificationToken.identifier },
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });

    // Delete the used token
    await prisma.verificationToken.delete({
      where: { token },
    });

    return NextResponse.json({
      message: "邮箱验证成功",
      email: user.email,
    });
  } catch (err) {
    console.error("[Verify API] Error:", err);
    return NextResponse.json(
      { error: "验证失败，请稍后重试" },
      { status: 500 },
    );
  }
}
