/**
 * @file POST /api/auth/forgot — Send password reset email.
 *
 * Only works for users who have bound an OAuth account (and thus have an email).
 * Pure password-only users must contact an admin to reset their password.
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
    const { username, email } = body;

    const login = username || email;
    if (!login || typeof login !== "string") {
      return NextResponse.json({ error: "请输入用户名或邮箱" }, { status: 400 });
    }

    // Try to find user by username first, then by email
    let user = await prisma.user.findUnique({
      where: { username: login },
    });

    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: login },
      });
    }

    // If user not found or has no email, tell them to contact admin
    if (!user || !user.email) {
      return NextResponse.json({
        message: "未找到已绑定邮箱的用户，请联系管理员重置密码",
        noEmail: true,
      });
    }

    // Generate reset token (valid for 1 hour)
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    const userEmail = user.email as string; // guaranteed non-null here

    // Clean up old tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: userEmail },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: userEmail,
        token,
        expires,
      },
    });

    await sendEmail({
      to: userEmail,
      subject: "重置密码 - Miniese's Blog",
      html: await resetPasswordEmailHtml(token),
    });

    return NextResponse.json({
      message: "如果该用户已绑定邮箱，您将收到重置密码邮件",
    });
  } catch (err) {
    console.error("[Forgot API] Error:", err);
    return NextResponse.json(
      { error: "发送失败，请稍后重试" },
      { status: 500 },
    );
  }
}
