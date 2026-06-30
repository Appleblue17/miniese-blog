/**
 * @file POST /api/auth/oauth/link — Link OAuth account to current user.
 *
 * Requires authentication. Creates an Account record linking the
 * current user to the specified OAuth provider account.
 *
 * This is used when a user first signs up and wants to bind an
 * OAuth account (Google/GitHub) to their local account later.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { provider, providerAccountId, access_token, refresh_token } = body;

    if (!provider || !providerAccountId) {
      return NextResponse.json(
        { error: "缺少 OAuth 提供商信息" },
        { status: 400 },
      );
    }

    // Check if this OAuth account is already linked to someone else
    const existing = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
    });

    if (existing) {
      if (existing.userId === session.user.id) {
        return NextResponse.json(
          { message: "该 OAuth 账号已绑定到当前用户" },
        );
      }
      return NextResponse.json(
        { error: "该 OAuth 账号已被其他用户绑定" },
        { status: 409 },
      );
    }

    // Link OAuth account to current user
    await prisma.account.create({
      data: {
        userId: session.user.id,
        type: "oauth",
        provider,
        providerAccountId,
        access_token,
        refresh_token,
      },
    });

    return NextResponse.json({ message: "OAuth 账号绑定成功" });
  } catch (err) {
    console.error("[OAuth Link API] Error:", err);
    return NextResponse.json(
      { error: "绑定失败，请稍后重试" },
      { status: 500 },
    );
  }
}
