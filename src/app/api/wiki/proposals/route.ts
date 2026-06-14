/**
 * @file /api/wiki/proposals — Wiki term proposals API.
 *
 * POST /api/wiki/proposals — Submit a new term proposal (requires login)
 * GET  /api/wiki/proposals — List proposals (admin)
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
    const { name, sourceArticleId, sourceContext } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "词条名称不能为空" },
        { status: 400 },
      );
    }

    // Rate limit: max 3 proposals per 5 minutes per user
    const recentProposals = await prisma.wikiProposal.count({
      where: {
        userId: session.user.id,
        createdAt: { gte: new Date(Date.now() - 5 * 60_000) },
      },
    });
    if (recentProposals >= 3) {
      return NextResponse.json(
        { error: "申请过于频繁，请稍后再试" },
        { status: 429 },
      );
    }

    const proposal = await prisma.wikiProposal.create({
      data: {
        name,
        sourceArticleId: sourceArticleId || undefined,
        sourceContext: sourceContext || undefined,
        userId: session.user.id,
        status: "pending",
      },
    });

    return NextResponse.json(proposal, { status: 201 });
  } catch (err) {
    console.error("[WikiProposal API] Error:", err);
    return NextResponse.json(
      { error: "提交申请失败" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const where = status ? { status: status as "pending" | "approved" | "rejected" } : {};

  const proposals = await prisma.wikiProposal.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { name: true, email: true },
      },
      article: {
        select: { slug: true, title: true, language: true },
      },
    },
  });

  return NextResponse.json(proposals);
}
