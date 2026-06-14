/**
 * @file POST /api/auth/forgot — Send password reset email.
 *
 * Generates a reset token, stores it as a VerificationToken,
 * and sends a reset link to the user's email.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail, resetPasswordEmailHtml } from "@/lib/mail";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "请输入邮箱地址" }, { status: 400 });
    }

    // Check if user exists (don't reveal existence for security)
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Return success even if user doesn't exist (security best practice)
      return NextResponse.json({
        message: "如果该邮箱已注册，您将收到重置密码邮件",
      });
    }

    // Generate reset token (valid for 1 hour)
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    // Clean up old tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: email },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires,
      },
    });

    await sendEmail({
      to: email,
      subject: "重置密码 - Miniese's Blog",
      html: resetPasswordEmailHtml(token),
    });

    return NextResponse.json({
      message: "如果该邮箱已注册，您将收到重置密码邮件",
    });
  } catch (err) {
    console.error("[Forgot API] Error:", err);
    return NextResponse.json(
      { error: "发送失败，请稍后重试" },
      { status: 500 },
    );
  }
}
