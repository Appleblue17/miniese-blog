/**
 * @file /api/comments — Comments API.
 *
 * GET  /api/comments?articleId=xxx — Get comments for an article and its translations
 * POST /api/comments             — Create a comment (requires login)
 *
 * Comments are shared across translation versions: when fetching or posting,
 * we resolve the "related group" via originalId so that zh/en versions share
 * the same comment thread.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Resolve all article IDs that share the same translation group.
 * Returns an array including the given articleId and all its siblings.
 */
async function resolveRelatedArticleIds(articleId: string): Promise<string[]> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, originalId: true },
  });
  if (!article) return [articleId];

  const rootId = article.originalId || article.id;

  // Find all articles in the same translation group
  const siblings = await prisma.article.findMany({
    where: {
      OR: [
        { id: rootId },
        { originalId: rootId },
      ],
    },
    select: { id: true },
  });

  return siblings.map((s) => s.id);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("articleId");

  if (!articleId) {
    return NextResponse.json({ error: "Missing articleId" }, { status: 400 });
  }

  const relatedIds = await resolveRelatedArticleIds(articleId);

  const comments = await prisma.comment.findMany({
    where: {
      articleId: { in: relatedIds },
      isHidden: false,
    },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: { name: true },
      },
    },
  });

  // Return author name from user relation if available
  const mapped = comments.map((c) => ({
    id: c.id,
    authorName: c.user?.name || c.authorName,
    content: c.content,
    createdAt: c.createdAt,
  }));

  return NextResponse.json(mapped);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { articleId, content } = body;

    if (!articleId || !content) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 },
      );
    }

    // Check if article exists
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });
    if (!article) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }

    // Resolve related article IDs for rate limiting
    const relatedIds = await resolveRelatedArticleIds(articleId);

    // Rate limit: max 1 comment per 60 seconds per user across all translations
    const recentComment = await prisma.comment.findFirst({
      where: {
        articleId: { in: relatedIds },
        userId: session.user.id,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (recentComment) {
      return NextResponse.json(
        { error: "评论过于频繁，请稍后再试" },
        { status: 429 },
      );
    }

    const comment = await prisma.comment.create({
      data: {
        articleId,
        content,
        authorName: session.user.name || session.user.email || "用户",
        userId: session.user.id,
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    console.error("[Comments API] Error:", err);
    return NextResponse.json(
      { error: "创建评论失败" },
      { status: 500 },
    );
  }
}
