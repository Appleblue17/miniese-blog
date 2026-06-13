/**
 * @file WikiList - Client component that fetches and renders a paginated wiki entry list.
 *
 * Features:
 * - Fetches entries from the API based on language
 * - Supports tag filtering
 * - Pagination controls
 * - Loading and empty states
 * - Layout driven by settings (adaptive / fixed-1 / fixed-2 / fixed-3)
 */

"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WikiCard } from "@/components/wiki/WikiCard";
import type { WikiEntryMeta, WikiListResponse } from "@/types/wiki";

interface WikiListProps {
  lang: string;
  initialTag?: string;
}

type Layout = "adaptive" | "fixed-1" | "fixed-2" | "fixed-3";

const LAYOUT_CLASSES: Record<Layout, string> = {
  adaptive: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
  "fixed-1": "flex flex-col gap-4",
  "fixed-2": "grid grid-cols-1 sm:grid-cols-2 gap-4",
  "fixed-3": "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
};

const DEFAULT_LAYOUT: Layout = "adaptive";

export function WikiList({ lang, initialTag }: WikiListProps) {
  const [data, setData] = useState<WikiListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [tag, setTag] = useState(initialTag || "");
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const limit = 20;

  // Fetch layout setting on mount
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((s) => {
        if (s?.appearance?.wikiListLayout) {
          setLayout(s.appearance.wikiListLayout);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      lang,
      page: String(page),
      limit: String(limit),
    });
    if (tag) params.set("tag", tag);

    fetch(`/api/wiki?${params}`)
      .then((res) => {
        if (!res.ok) {
          setData({ entries: [], total: 0, page: 1, totalPages: 0 });
          setLoading(false);
          return null;
        }
        return res.json();
      })
      .then((json: WikiListResponse | null) => {
        if (json) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        setData({ entries: [], total: 0, page: 1, totalPages: 0 });
        setLoading(false);
      });
  }, [lang, page, tag]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || (data && newPage > data.totalPages)) return;
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const title = lang === "zh" ? "知识库" : "Wiki";
  const subtitle = lang === "zh" ? "词条" : "entries";
  const gridClass = LAYOUT_CLASSES[layout] || LAYOUT_CLASSES.adaptive;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data && !loading ? `共 ${data.total} ${subtitle}` : "加载中..."}
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && data && data.entries.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <p className="text-lg">{lang === "zh" ? "暂无词条" : "No entries"}</p>
          <p className="text-sm">
            {lang === "zh"
              ? "知识库还没有任何词条，请稍后再来。"
              : "No wiki entries yet. Check back later."}
          </p>
        </div>
      )}

      {/* Entry cards */}
      {!loading && data && data.entries.length > 0 && (
        <>
          <div className={gridClass}>
            {data.entries.map((entry: WikiEntryMeta) => (
              <WikiCard key={entry.id} entry={entry} lang={lang} />
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
