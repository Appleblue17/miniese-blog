/**
 * @file /api/admin/proposals/[id]/approve — Approve a WikiProposal.
 *
 * When a WikiProposal is approved:
 * 1. AI evaluates the term (type, definition, importance) using sourceContext
 * 2. A WikiDiscovery record is created with the AI-evaluated metadata
 * 3. It appears in the wiki management's "申请中" tab for further processing
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { refineTerm } from "@/lib/ai/refineTerm";

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
    // Fetch the proposal
    const proposal = await prisma.wikiProposal.findUnique({
      where: { id },
      include: { article: { select: { slug: true, language: true } } },
    });

    if (!proposal) {
      return NextResponse.json({ error: "申请不存在" }, { status: 404 });
    }

    if (proposal.status !== "pending") {
      return NextResponse.json({ error: "该申请已处理" }, { status: 400 });
    }

    // Check for duplicate WikiDiscovery
    const existingDiscovery = await prisma.wikiDiscovery.findFirst({
      where: {
        term: proposal.name,
        articleSlug: proposal.article?.slug ?? "",
        articleLang: proposal.article?.language ?? "zh",
      },
    });

    if (existingDiscovery) {
      // If a discovery already exists, just approve the proposal and link
      await prisma.wikiProposal.update({
        where: { id },
        data: { status: "approved" },
      });
      return NextResponse.json({
        success: true,
        message: "该术语已有候选记录，已关联",
        discoveryId: existingDiscovery.id,
      });
    }

    // Call AI to evaluate the term (type, definition, importance)
    const lang = proposal.article?.language ?? "zh";
    let termType = "concept";
    let definition = proposal.sourceContext?.slice(0, 200) ?? "";
    let importance = 0.8;

    try {
      const refined = await refineTerm(proposal.name, lang);
      termType = refined.type;
      // Prefer sourceContext for definition (it's context-specific), fall back to AI
      if (!definition) {
        definition = refined.definition;
      }
      importance = refined.importance;
    } catch {
      // AI failed, use defaults set above
    }

    // Create a WikiDiscovery record with AI-evaluated metadata
    const discovery = await prisma.wikiDiscovery.create({
      data: {
        articleId: proposal.sourceArticleId || undefined,
        articleSlug: proposal.article?.slug ?? "",
        articleLang: lang as "zh" | "en",
        term: proposal.name,
        type: termType,
        definition,
        importance,
        status: "pending",
      },
    });

    // Mark proposal as approved
    await prisma.wikiProposal.update({
      where: { id },
      data: { status: "approved" },
    });

    return NextResponse.json({
      success: true,
      message: `已同意，候选词条已添加至知识库管理（${termType}，重要性 ${Math.round(importance * 100)}%）`,
      discoveryId: discovery.id,
    });
  } catch (err) {
    console.error("[Admin] Proposal approve error:", err);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
