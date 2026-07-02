/**
 * @file POST /api/admin/users/[id]/api-token
 *
 * Generates or regenerates an API token for the specified user.
 * The token is returned only once in the response.
 * The stored value is bcrypt-hashed; we return the raw token.
 *
 * Called by admin from the user management page.
 *
 * Response: { token: string, message: string }
 *   - token: the raw API token (show once)
 *   - message: confirmation message
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    // Find user
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // Generate raw token: 48 chars of hex = 192 bits
    const rawToken = `mb_${crypto.randomBytes(32).toString("hex")}`;

    // Hash for storage
    const hashedToken = await bcrypt.hash(rawToken, 10);

    // Store in DB
    await prisma.user.update({
      where: { id },
      data: { apiToken: hashedToken },
    });

    return NextResponse.json({
      token: rawToken,
      message: `API Token 已为用户 ${user.username || user.email} 生成`,
    });
  } catch (err) {
    console.error("[Admin API Token] Error:", err);
    return NextResponse.json({ error: "生成失败" }, { status: 500 });
  }
}
