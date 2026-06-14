/**
 * @file POST /api/auth/register — User registration.
 *
 * Validates input, checks for existing email, hashes password,
 * creates user (unverified), and sends verification email.
 */

import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail, verificationEmailHtml } from "@/lib/mail";

/**
 * Dynamically load dev settings to check skipEmailVerification flag.
 */
async function shouldSkipEmailVerification(): Promise<boolean> {
  try {
    const { getSettings } = await import(
      "../../../../../../config/settings"
    );
    const settings = await getSettings();
    const features = settings.features as Record<string, unknown>;
    return features.devMode === true && features.skipEmailVerification === true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // Validate input
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "请输入邮箱地址" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "密码至少需要 6 个字符" },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "该邮箱已被注册" },
        { status: 409 },
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Check dev settings for skipEmailVerification
    const skipVerification = await shouldSkipEmailVerification();
    const emailVerified = skipVerification ? new Date() : null;

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || email.split("@")[0],
        role: "user",
        emailVerified,
      },
    });

    // Send verification email if not auto-verified
    if (!emailVerified) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

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
        subject: "验证您的邮箱 - Miniese's Blog",
        html: verificationEmailHtml(token),
      });
    }

    return NextResponse.json(
      {
        message: emailVerified
          ? "注册成功"
          : "注册成功，请查收验证邮件",
        email,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[Register API] Error:", err);
    return NextResponse.json(
      { error: "注册失败，请稍后重试" },
      { status: 500 },
    );
  }
}
