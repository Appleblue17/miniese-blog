/**
 * @file /admin/articles - Article management list page.
 *
 * Shows all published articles with their linked drafts below.
 * New drafts (no linked article) are shown as placeholder article rows.
 * Each row shows modified time, line count, and character count.
 */

import Link from "next/link";
import { PlusCircle, FileText, Eye } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "文章管理 | Miniese's Blog",
};

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

async function fetchData() {
  try {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/admin/articles`, {
      cache: "no-store",
    });
    if (!res.ok) return { articles: [], drafts: [], newDrafts: [] };
    return res.json();
  } catch {
    return { articles: [], drafts: [], newDrafts: [] };
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    published:
      "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    draft: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    review:
      "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  };

  const labels: Record<string, string> = {
    published: "已发布",
    draft: "草稿",
    review: "审查中",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
        variants[status] || variants.draft
      }`}
    >
      {labels[status] || status}
    </span>
  );
}

function ArticleMetaRow({
  language,
  publishedAt,
  updatedAt,
  viewCount,
  charCount,
  lineCount,
}: {
  language: string;
  publishedAt?: string | null;
  updatedAt: string;
  viewCount?: number;
  charCount: number;
  lineCount: number;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
      <span>{language === "zh" ? "中文" : "English"}</span>
      {publishedAt != null && <span>发布 {formatDate(publishedAt)}</span>}
      <span>修改 {formatDateTime(updatedAt)}</span>
      {viewCount != null && <span>阅读 {viewCount}</span>}
      <span>{lineCount} 行</span>
      <span>{charCount} 字符</span>
    </div>
  );
}

export default async function AdminArticlesPage() {
  const { articles, drafts, newDrafts } = await fetchData();

  const hasContent = articles.length > 0 || newDrafts.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">文章管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {articles.length} 篇已发布
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
          {articles.map((article: ArticleItem) => {
            const linkedDraft = drafts.find(
              (d: DraftItem) => d.draftOfId === article.id,
            );

            return (
              <div key={article.id} className="flex flex-col gap-1">
                {/* Published article row */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {article.title}
                      </span>
                      <StatusBadge status={article.status} />
                    </div>
                    <ArticleMetaRow
                      language={article.language}
                      publishedAt={article.publishedAt}
                      updatedAt={article.updatedAt}
                      viewCount={article.viewCount}
                      charCount={article.charCount}
                      lineCount={article.lineCount}
                    />
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Link
                      href={`/${article.language}/articles/${article.slug}`}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      target="_blank"
                    >
                      <Eye className="size-4" />
                    </Link>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      /{article.slug}
                    </span>
                  </div>
                </div>

                {/* Linked draft row (below the article) */}
                {linkedDraft && (
                  <div className="flex items-center justify-between rounded-lg border border-dashed border-yellow-300 dark:border-yellow-700 bg-card/50 px-4 py-2.5 ml-6 border-l-2 border-l-yellow-400">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <FileText className="size-3.5 text-muted-foreground" />
                        <span className="text-sm">{linkedDraft.title}</span>
                        <StatusBadge status={linkedDraft.status} />
                      </div>
                      <ArticleMetaRow
                        language={linkedDraft.language}
                        updatedAt={linkedDraft.updatedAt}
                        charCount={linkedDraft.charCount}
                        lineCount={linkedDraft.lineCount}
                      />
                    </div>
                    <Link
                      href={`/admin/articles/${linkedDraft.id}/edit`}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      编辑草稿
                    </Link>
                  </div>
                )}
              </div>
            );
          })}

          {/* New article drafts (no linked published article) */}
          {newDrafts.map((draft: DraftItem) => (
            <div key={draft.id} className="flex flex-col gap-1">
              {/* Placeholder article row */}
              <div className="flex items-center justify-between rounded-lg border border-dashed border-border bg-card/30 px-4 py-3 opacity-70">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">新文章</span>
                    <StatusBadge status="draft" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    暂无已发布版本
                  </div>
                </div>
              </div>

              {/* Draft row (below placeholder) */}
              <div className="flex items-center justify-between rounded-lg border border-dashed border-yellow-300 dark:border-yellow-700 bg-card px-4 py-3 ml-6 border-l-2 border-l-yellow-400">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span className="font-medium text-sm">{draft.title}</span>
                    <StatusBadge status={draft.status} />
                  </div>
                  <ArticleMetaRow
                    language={draft.language}
                    updatedAt={draft.updatedAt}
                    charCount={draft.charCount}
                    lineCount={draft.lineCount}
                  />
                </div>
                <Link
                  href={`/admin/articles/${draft.id}/edit`}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  编辑
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
