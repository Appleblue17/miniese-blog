/**
 * @file ArticleList - Client component that fetches and renders a paginated article list.
 *
 * Features:
 * - Fetches articles from the API based on language
 * - Supports tag filtering
 * - Pagination controls
 * - Loading and empty states
 * - Layout driven by settings (adaptive / fixed-1 / fixed-2 / fixed-3)
 */

"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ArticleCard } from "@/components/article/ArticleCard";
import type { ArticleMeta } from "@/types/article";

interface ArticleListProps {
  lang: string;
  initialTag?: string;
}

interface ApiResponse {
  articles: ArticleMeta[];
  total: number;
  page: number;
  totalPages: number;
}

type Layout = "adaptive" | "fixed-1" | "fixed-2" | "fixed-3";

const LAYOUT_CLASSES: Record<Layout, string> = {
  adaptive: "flex flex-col gap-4",
  "fixed-1": "flex flex-col gap-4",
  "fixed-2": "grid grid-cols-1 sm:grid-cols-2 gap-4",
  "fixed-3": "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
};

const DEFAULT_LAYOUT: Layout = "adaptive";

export function ArticleList({ lang, initialTag }: ArticleListProps) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [tag, setTag] = useState(initialTag || "");
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const limit = 10;

  // Fetch layout setting on mount
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((s) => {
        if (s?.appearance?.articleListLayout) {
          setLayout(s.appearance.articleListLayout);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ lang, page: String(page), limit: String(limit) });
    if (tag) params.set("tag", tag);

    fetch(`/api/articles?${params}`)
      .then((res) => {
        if (!res.ok) {
          setData({ articles: [], total: 0, page: 1, totalPages: 0 });
          setLoading(false);
          return null;
        }
        return res.json();
      })
      .then((json: ApiResponse | null) => {
        if (json) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        setData({ articles: [], total: 0, page: 1, totalPages: 0 });
        setLoading(false);
      });
  }, [lang, page, tag]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || (data && newPage > data.totalPages)) return;
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const gridClass = LAYOUT_CLASSES[layout] || LAYOUT_CLASSES.adaptive;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{lang === "zh" ? "文章" : "Articles"}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data && !loading ? `共 ${data.total} 篇文章` : "加载中..."}
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && data && data.articles.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <p className="text-lg">暂无文章</p>
          <p className="text-sm">还没有发布任何文章，请稍后再来。</p>
        </div>
      )}

      {/* Article cards */}
      {!loading && data && data.articles.length > 0 && (
        <>
          <div className={gridClass}>
            {data.articles.map((article) => (
              <ArticleCard key={article.id} article={article} lang={lang} />
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
              >
                <ChevronLeft className="size-4" />
                上一页
              </Button>

              <span className="text-sm text-muted-foreground px-4">
                第 {data.page} / {data.totalPages} 页
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                下一页
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
