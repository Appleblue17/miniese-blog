/**
 * @file GET /api/auth/oauth/accounts — Get linked OAuth accounts for current user.
 *
 * Requires authentication. Returns a list of OAuth providers linked to the user.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const accounts = await prisma.account.findMany({
      where: { userId: session.user.id },
      select: {
        provider: true,
        // Don't expose tokens
      },
    });

    return NextResponse.json({
      accounts: accounts.map((a) => ({ provider: a.provider })),
    });
  } catch (err) {
    console.error("[OAuth Accounts API] Error:", err);
    return NextResponse.json(
      { error: "获取失败" },
      { status: 500 },
    );
  }
}
