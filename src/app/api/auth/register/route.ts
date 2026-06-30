/**
 * @file POST /api/auth/register — User registration.
 *
 * Validates input, checks for existing username, hashes password,
 * creates user (no email required). Email is optional and can be
 * added later via OAuth binding.
 */

import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, name } = body;

    // Validate input
    if (!username || typeof username !== "string" || username.trim().length === 0) {
      return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
    }

    const trimmedUsername = username.trim();

    // Username format: alphanumeric, hyphens, underscores, 2-32 chars
    if (!/^[a-zA-Z0-9_-]{2,32}$/.test(trimmedUsername)) {
      return NextResponse.json(
        { error: "用户名只能包含字母、数字、下划线和连字符，长度 2-32 个字符" },
        { status: 400 },
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "密码至少需要 6 个字符" },
        { status: 400 },
      );
    }

    // Check if username already exists
    const existing = await prisma.user.findUnique({
      where: { username: trimmedUsername },
    });
    if (existing) {
      return NextResponse.json(
        { error: "该用户名已被使用" },
        { status: 409 },
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user (no email required)
    const user = await prisma.user.create({
      data: {
        username: trimmedUsername,
        password: hashedPassword,
        name: name || trimmedUsername,
        roles: ["user"],
      },
    });

    return NextResponse.json(
      {
        message: "注册成功",
        username: user.username,
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
