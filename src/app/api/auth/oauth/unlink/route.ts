/**
 * @file POST /api/auth/oauth/unlink — Unlink OAuth account from current user.
 *
 * Requires authentication. Removes the Account record for the specified
 * provider from the current user.
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
    const { provider } = body;

    if (!provider) {
      return NextResponse.json(
        { error: "缺少提供商信息" },
        { status: 400 },
      );
    }

    // Find and delete the account record
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "未找到绑定的 OAuth 账号" },
        { status: 404 },
      );
    }

    // If this is the only account and user has no password, prevent unlinking
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { accounts: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (!user.password && user.accounts.length <= 1) {
      return NextResponse.json(
        { error: "无法解绑最后一个登录方式，请先设置密码" },
        { status: 400 },
      );
    }

    await prisma.account.delete({
      where: { id: account.id },
    });

    return NextResponse.json({ message: "OAuth 账号解绑成功" });
  } catch (err) {
    console.error("[OAuth Unlink API] Error:", err);
    return NextResponse.json(
      { error: "解绑失败，请稍后重试" },
      { status: 500 },
    );
  }
}
