/**
 * @file /admin/articles - Article management list page.
 *
 * Shows all published articles with their linked drafts below.
 * New drafts (no linked article) are shown as placeholder article rows.
 * Supports pagination with consistent styling to AdminWikiList.
 *
 * NOTE: This server component queries the database directly instead of
 * calling the API route, because server-to-server fetch requests do not
 * carry the user's session cookie and would be rejected by the proxy auth.
 */

import Link from "next/link";
import { PlusCircle, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { ArticleRowActions } from "@/components/admin/ArticleRowActions";
import { AdminArticleSearch } from "@/components/admin/AdminArticleSearch";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import path from "path";

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
  isAITranslated: boolean;
  isHidden: boolean;
  isPinned: boolean;
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

interface TranslationItem {
  id: string;
  slug: string;
  title: string;
  language: string;
  status: string;
  contentPath: string;
  updatedAt: string;
  originalId: string | null;
  isAITranslated: boolean;
  charCount: number;
  lineCount: number;
}

interface AdminArticlesResponse {
  articles: ArticleItem[];
  translations: TranslationItem[];
  drafts: DraftItem[];
  newDrafts: DraftItem[];
  pendingTasks: Record<string, string[]>;
  total: number;
  page: number;
  totalPages: number;
  allTags: string[];
}

async function getFileStats(contentPath: string) {
  try {
    const content = await readFile(path.join(process.cwd(), contentPath), "utf-8");
    return {
      charCount: content.length,
      lineCount: content.split("\n").length,
    };
  } catch {
    return { charCount: 0, lineCount: 0 };
  }
}

async function fetchData(
  page: number,
  q = "",
  tagFilter = "",
  tagExclude = "",
): Promise<AdminArticlesResponse> {
  try {
    const limit = PAGE_SIZE;
    const skip = (page - 1) * limit;

    // Build where clause for published ORIGINAL articles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { status: "published", originalId: null };

    // Full-text search
    if (q && q.trim()) {
      const searchTerm = q.trim();
      where.AND = [
        {
          OR: [
            { title: { contains: searchTerm, mode: "insensitive" as const } },
            { summary: { contains: searchTerm, mode: "insensitive" as const } },
            { tags: { has: searchTerm } },
          ],
        },
      ];
    }

    // Tag include filter
    if (tagFilter && tagFilter.trim()) {
      const includeTags = tagFilter.split(",").map((t) => t.trim()).filter(Boolean);
      if (includeTags.length > 0) {
        const andClause = where.AND || [];
        andClause.push({ tags: { hasEvery: includeTags } });
        where.AND = andClause;
      }
    }

    // Tag exclude filter
    if (tagExclude && tagExclude.trim()) {
      const excludeTags = tagExclude.split(",").map((t) => t.trim()).filter(Boolean);
      if (excludeTags.length > 0) {
        where.NOT = { tags: { hasSome: excludeTags } };
      }
    }

    // Get total count of published ORIGINAL articles (exclude translations)
    const total = await prisma.article.count({ where });

    // Get paginated published ORIGINAL articles (exclude translations)
    const publishedArticles = await prisma.article.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip,
      take: limit,
    });

    const linkedArticleIds = publishedArticles.map((a) => a.id);

    // Get all translation versions linked to the current page's articles
    const allTranslations = await prisma.article.findMany({
      where: { originalId: { in: linkedArticleIds } },
    });

    // Get ALL drafts
    const allDrafts = await prisma.article.findMany({
      where: { status: { in: ["draft", "review"] } },
    });

    const drafts = allDrafts.filter(
      (d) => d.draftOfId !== null && linkedArticleIds.includes(d.draftOfId),
    );
    const newDrafts = allDrafts.filter((d) => d.draftOfId === null);

    // Get active AI tasks
    const allArticleIds = [...linkedArticleIds, ...allTranslations.map((t) => t.id)];
    const activeTasks = await prisma.aiTask.findMany({
      where: {
        articleId: { in: allArticleIds },
        status: { in: ["pending", "processing"] },
      },
      select: { articleId: true, type: true },
    });

    const pendingTasks: Record<string, string[]> = {};
    for (const task of activeTasks) {
      if (!pendingTasks[task.articleId!]) {
        pendingTasks[task.articleId!] = [];
      }
      pendingTasks[task.articleId!].push(task.type);
    }

    const articlesWithStats = await Promise.all(
      publishedArticles.map(async (a) => {
        const stats = await getFileStats(a.contentPath);
        return {
          id: a.id,
          slug: a.slug,
          title: a.title,
          language: a.language,
          status: a.status,
          contentPath: a.contentPath,
          summary: a.summary,
          tags: a.tags,
          author: a.author,
          publishedAt: a.publishedAt?.toISOString() || null,
          updatedAt: a.updatedAt.toISOString(),
          changelog: a.changelog,
          viewCount: a.viewCount,
          isAITranslated: a.isAITranslated,
          isHidden: a.isHidden,
          isPinned: a.isPinned,
          ...stats,
        };
      }),
    );

    const translationsWithStats = await Promise.all(
      allTranslations.map(async (t) => {
        const stats = await getFileStats(t.contentPath);
        return {
          id: t.id,
          slug: t.slug,
          title: t.title,
          language: t.language,
          status: t.status,
          contentPath: t.contentPath,
          updatedAt: t.updatedAt.toISOString(),
          originalId: t.originalId,
          isAITranslated: t.isAITranslated,
          ...stats,
        };
      }),
    );

    const draftsWithStats = await Promise.all(
      drafts.map(async (d) => {
        const stats = await getFileStats(d.contentPath);
        return {
          id: d.id,
          slug: d.slug,
          title: d.title,
          language: d.language,
          status: d.status,
          contentPath: d.contentPath,
          updatedAt: d.updatedAt.toISOString(),
          draftOfId: d.draftOfId,
          ...stats,
        };
      }),
    );

    const newDraftsWithStats = await Promise.all(
      newDrafts.map(async (d) => {
        const stats = await getFileStats(d.contentPath);
        return {
          id: d.id,
          slug: d.slug,
          title: d.title,
          language: d.language,
          status: d.status,
          contentPath: d.contentPath,
          updatedAt: d.updatedAt.toISOString(),
          draftOfId: null,
          ...stats,
        };
      }),
    );

    // Collect all tags from all published articles for the filter dropdown
    const allTagRecords = await prisma.article.findMany({
      where: { status: "published", originalId: null },
      select: { tags: true },
    });
    const tagSet = new Set<string>();
    for (const record of allTagRecords) {
      for (const tag of record.tags) {
        tagSet.add(tag);
      }
    }
    const allTags = Array.from(tagSet).sort();

    return {
      articles: articlesWithStats,
      translations: translationsWithStats,
      drafts: draftsWithStats,
      newDrafts: newDraftsWithStats,
      pendingTasks,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      allTags,
    };
  } catch {
    return {
      articles: [],
      translations: [],
      drafts: [],
      newDrafts: [],
      pendingTasks: {},
      total: 0,
      page: 1,
      totalPages: 0,
      allTags: [],
    };
  }
}

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; tagFilter?: string; tagExclude?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));
  const q = params.q || "";
  const tagFilterParam = params.tagFilter || "";
  const tagExcludeParam = params.tagExclude || "";

  const {
    articles,
    translations,
    drafts,
    newDrafts,
    pendingTasks,
    total,
    allTags,
  } = await fetchData(currentPage, q, tagFilterParam, tagExcludeParam);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE)) || 1;

  const hasContent = articles.length > 0 || newDrafts.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="inline-flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">文章管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {total} 篇已发布
              {newDrafts.length > 0 && ` · ${newDrafts.length} 篇新草稿`}
            </p>
          </div>
        </div>
        <Link
          href="/admin/articles/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
        >
          <PlusCircle className="size-4" />
          发布新文章
        </Link>
      </div>

      <AdminArticleSearch
        q={q}
        tagFilter={tagFilterParam}
        tagExclude={tagExcludeParam}
        allTags={allTags}
      />

      {!hasContent ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <p className="text-lg">暂无文章</p>
          <p className="text-sm">还没有发布任何文章，点击上方按钮开始发布。</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <ArticleRowActions
            articles={articles}
            translations={translations}
            drafts={drafts}
            newDrafts={newDrafts}
            pendingTasks={pendingTasks}
          />
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 mt-6" aria-label="分页">
          <Link
            href={(() => {
              if (currentPage <= 1) return "#";
              const p = new URLSearchParams();
              p.set("page", String(currentPage - 1));
              if (q) p.set("q", q);
              if (tagFilterParam) p.set("tagFilter", tagFilterParam);
              if (tagExcludeParam) p.set("tagExclude", tagExcludeParam);
              return `/admin/articles?${p.toString()}`;
            })()}
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
              if (p === 1 || p === totalPages) return true;
              if (Math.abs(p - currentPage) <= 1) return true;
              return false;
            })
            .map((p, idx, arr) => {
              const prev = arr[idx - 1];
              const needsEllipsis = prev !== undefined && p - prev > 1;
              return (
                <span key={p} className="inline-flex items-center gap-1">
                  {needsEllipsis && (
                    <span className="px-2 text-sm text-muted-foreground/60">...</span>
                  )}
                  <Link
                    href={(() => {
                      const sp = new URLSearchParams();
                      sp.set("page", String(p));
                      if (q) sp.set("q", q);
                      if (tagFilterParam) sp.set("tagFilter", tagFilterParam);
                      if (tagExcludeParam) sp.set("tagExclude", tagExcludeParam);
                      return `/admin/articles?${sp.toString()}`;
                    })()}
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
            href={(() => {
              if (currentPage >= totalPages) return "#";
              const p = new URLSearchParams();
              p.set("page", String(currentPage + 1));
              if (q) p.set("q", q);
              if (tagFilterParam) p.set("tagFilter", tagFilterParam);
              if (tagExcludeParam) p.set("tagExclude", tagExcludeParam);
              return `/admin/articles?${p.toString()}`;
            })()}
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
