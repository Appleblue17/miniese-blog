/**
 * @file /admin/articles - Article management list page.
 *
 * Shows all published articles with their linked drafts below.
 * New drafts (no linked article) are shown as placeholder article rows.
 * Supports pagination with consistent styling to AdminWikiList.
 */

import Link from "next/link";
import { PlusCircle, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { ArticleRowActions } from "@/components/admin/ArticleRowActions";

export const metadata: Metadata = {
  title: "文章管理 | Miniese's Blog",
};

const PAGE_SIZE = 15;

interface ArticleItem {
  id: string;
  slug: string;
  title: string;
  language: string;
  status: string;
  contentPath: string;
  summary: string | null;
  tags: string[];
  author: string;
  publishedAt: string | null;
  updatedAt: string;
  changelog: string | null;
  viewCount: number;
  charCount: number;
  lineCount: number;
}

interface DraftItem {
  id: string;
  slug: string;
  title: string;
  language: string;
  status: string;
  contentPath: string;
  updatedAt: string;
  draftOfId: string | null;
  charCount: number;
  lineCount: number;
}

interface AdminArticlesResponse {
  articles: ArticleItem[];
  drafts: DraftItem[];
  newDrafts: DraftItem[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchData(
  page: number,
): Promise<AdminArticlesResponse> {
  try {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const res = await fetch(
      `${baseUrl}/api/admin/articles?page=${page}&limit=${PAGE_SIZE}`,
      { cache: "no-store" },
    );
    if (!res.ok) return { articles: [], drafts: [], newDrafts: [], total: 0, page: 1, totalPages: 0 };
    return res.json();
  } catch {
    return { articles: [], drafts: [], newDrafts: [], total: 0, page: 1, totalPages: 0 };
  }
}

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));

  const { articles, drafts, newDrafts, total } = await fetchData(currentPage);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE)) || 1;

  const hasContent = articles.length > 0 || newDrafts.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">文章管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} 篇已发布
            {newDrafts.length > 0 && ` · ${newDrafts.length} 篇新草稿`}
          </p>
        </div>
        <Link
          href="/admin/articles/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
        >
          <PlusCircle className="size-4" />
          发布新文章
        </Link>
      </div>

      {!hasContent ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <p className="text-lg">暂无文章</p>
          <p className="text-sm">
            还没有发布任何文章，点击上方按钮开始发布。
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <ArticleRowActions
            articles={articles}
            drafts={drafts}
            newDrafts={newDrafts}
          />
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 mt-6" aria-label="分页">
          <Link
            href={currentPage > 1 ? `/admin/articles?page=${currentPage - 1}` : "#"}
            className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm ${
              currentPage <= 1
                ? "text-muted-foreground/40 pointer-events-none"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <ChevronLeft className="size-4" />
          </Link>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => {
              // Show first, last, and pages around current
              if (p === 1 || p === totalPages) return true;
              if (Math.abs(p - currentPage) <= 1) return true;
              return false;
            })
            .map((p, idx, arr) => {
              // Add ellipsis
              const prev = arr[idx - 1];
              const needsEllipsis = prev !== undefined && p - prev > 1;
              return (
                <span key={p} className="inline-flex items-center gap-1">
                  {needsEllipsis && (
                    <span className="px-2 text-sm text-muted-foreground/60">...</span>
                  )}
                  <Link
                    href={`/admin/articles?page=${p}`}
                    className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium ${
                      p === currentPage
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {p}
                  </Link>
                </span>
              );
            })}
          <Link
            href={currentPage < totalPages ? `/admin/articles?page=${currentPage + 1}` : "#"}
            className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm ${
              currentPage >= totalPages
                ? "text-muted-foreground/40 pointer-events-none"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <ChevronRight className="size-4" />
          </Link>
        </nav>
      )}
    </div>
  );
}
