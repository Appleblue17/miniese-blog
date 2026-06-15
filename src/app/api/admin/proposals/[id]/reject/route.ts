/**
 * @file /api/admin/proposals/[id]/reject — Reject a WikiProposal.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const roles = (session?.user as { roles?: string[] })?.roles || [];
  if (!session?.user || !roles.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const proposal = await prisma.wikiProposal.findUnique({ where: { id } });

    if (!proposal) {
      return NextResponse.json({ error: "申请不存在" }, { status: 404 });
    }

    if (proposal.status !== "pending") {
      return NextResponse.json({ error: "该申请已处理" }, { status: 400 });
    }

    await prisma.wikiProposal.update({
      where: { id },
      data: { status: "rejected" },
    });

    return NextResponse.json({
      success: true,
      message: "已驳回",
    });
  } catch (err) {
    console.error("[Admin] Proposal reject error:", err);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
