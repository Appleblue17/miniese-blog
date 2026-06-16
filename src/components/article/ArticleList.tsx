/**
 * @file ArticleList - Client component that fetches and renders a paginated article list.
 *
 * Features:
 * - Fetches articles from the API based on language
 * - Full-text search (debounced)
 * - Tag include/exclude filters
 * - Pagination controls
 * - Loading and empty states
 * - Responsive grid layout (1 col mobile, 2 col tablet, 3 col desktop)
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ArticleCard } from "@/components/article/ArticleCard";
import { SearchFilters } from "@/components/ui/SearchFilters";
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

const limit = 10;

export function ArticleList({ lang, initialTag }: ArticleListProps) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [tag, setTag] = useState(initialTag || "");
  const [searchQ, setSearchQ] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagExclude, setTagExclude] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  const fetchArticles = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      lang,
      page: String(page),
      limit: String(limit),
    });
    if (tag) params.set("tag", tag);
    if (searchQ) params.set("q", searchQ);
    if (tagFilter.length > 0) params.set("tagFilter", tagFilter.join(","));
    if (tagExclude.length > 0) params.set("tagExclude", tagExclude.join(","));

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
  }, [lang, page, tag, searchQ, tagFilter, tagExclude]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // Fetch available tags on mount
  useEffect(() => {
    fetch(`/api/articles?lang=${lang}&page=1&limit=1`)
      .then((res) => res.ok ? res.json() : null)
      .then(() => {
        // Fetch all tags via a separate request
        fetch(`/api/tags?type=article&lang=${lang}`)
          .then((res) => res.ok ? res.json() : null)
          .then((data) => {
            if (data?.tags) setAllTags(data.tags);
          })
          .catch(() => {});
      })
      .catch(() => {});
  }, [lang]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || (data && newPage > data.totalPages)) return;
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Reset page when filters change
  const handleSearch = useCallback((q: string) => {
    setSearchQ(q);
    setPage(1);
  }, []);

  const handleTagFilter = useCallback((tags: string[]) => {
    setTagFilter(tags);
    setPage(1);
  }, []);

  const handleTagExclude = useCallback((tags: string[]) => {
    setTagExclude(tags);
    setPage(1);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">{lang === "zh" ? "文章" : "Articles"}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {data && !loading
            ? (lang === "zh" ? `共 ${data.total} 篇文章` : `${data.total} articles`)
            : (lang === "zh" ? "加载中..." : "Loading...")}
        </p>
      </div>

      {/* Search & Filters */}
      <SearchFilters
        q={searchQ}
        tagFilter={tagFilter}
        tagExclude={tagExclude}
        allTags={allTags}
        onSearch={handleSearch}
        onTagFilter={handleTagFilter}
        onTagExclude={handleTagExclude}
        lang={lang}
      />

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && data && data.articles.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <p className="text-lg">{lang === "zh" ? "暂无文章" : "No articles"}</p>
          <p className="text-sm">{lang === "zh" ? "没有找到匹配的文章" : "No matching articles found."}</p>
        </div>
      )}

      {/* Article cards */}
      {!loading && data && data.articles.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                {lang === "zh" ? "上一页" : "Prev"}
              </Button>

              <span className="text-sm text-muted-foreground px-4">
                {lang === "zh"
                  ? `第 ${data.page} / ${data.totalPages} 页`
                  : `Page ${data.page} of ${data.totalPages}`}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                {lang === "zh" ? "下一页" : "Next"}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
