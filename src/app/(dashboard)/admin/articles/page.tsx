/**
 * @file /admin/articles - Article management list page.
 *
 * Shows all published articles with their linked drafts below.
 * New drafts (no linked article) are shown as placeholder article rows.
 * Each row shows modified time, line count, and character count.
 */

import Link from "next/link";
import { PlusCircle } from "lucide-react";
import type { Metadata } from "next";
import { ArticleRowActions } from "@/components/admin/ArticleRowActions";

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
          <ArticleRowActions
            articles={articles}
            drafts={drafts}
            newDrafts={newDrafts}
          />
        </div>
      )}
    </div>
  );
}
