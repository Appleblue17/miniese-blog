/**
 * @file GET /api/admin/comments — Admin comments list.
 *
 * Returns all comments with article title and user info, paginated.
 * Admin-only (protected by proxy.ts).
 *
 * Query params:
 *   page  - page number (default 1)
 *   limit - items per page (default 20)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        article: {
          select: { id: true, slug: true, title: true, language: true },
        },
      },
    }),
    prisma.comment.count(),
  ]);

  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      articleId: c.articleId,
      articleTitle: c.article.title,
      articleSlug: c.article.slug,
      articleLang: c.article.language,
      authorName: c.user?.name || c.authorName,
      authorEmail: c.user?.email || null,
      userId: c.userId,
      content: c.content,
      isHidden: c.isHidden,
      createdAt: c.createdAt.toISOString(),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
