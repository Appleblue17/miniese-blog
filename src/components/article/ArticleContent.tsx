/**
 * @file ArticleContent — Client component that fetches article HTML on mount
 * and renders the article body + TOC. Used with Suspense in the article page
 * for streaming.
 *
 * Client-side fetch avoids RSC SSR/hydration mismatches with dangerouslySetInnerHTML.
 * On initial mount, renders the Suspense fallback (ArticleSkeleton) while fetching.
 */

"use client";

import { useEffect, useState } from "react";

import { TableOfContents } from "@/components/article/TableOfContents";
import { WikiPreview } from "@/components/wiki/WikiPreview";
import { CommentSection } from "@/components/article/CommentSection";
import { ArticleSkeleton } from "@/components/article/ArticleSkeleton";

interface ArticleContentProps {
  lang: string;
  slug: string;
  articleId?: string;
  /**
   * When true, renders ArticleSkeleton instead of fetching.
   * Used by page.tsx during the initial meta-loading phase so the entire
   * page layout (header + body skeleton) is visible immediately.
   */
  loading?: boolean;
}

interface ArticleBodyResponse {
  html: string;
}

export function ArticleContent({ lang, slug, articleId, loading = false }: ArticleContentProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    // Don't fetch until articleId is available (page.tsx passes it after meta loads)
    if (!articleId) return;

    let cancelled = false;

    async function fetchBody() {
      try {
        const res = await fetch(`/api/articles/${slug}?lang=${lang}&fields=body`);
        if (!res.ok) {
          if (!cancelled) setHtml(null);
          return;
        }
        const data: ArticleBodyResponse = await res.json();
        if (!cancelled) setHtml(data.html || null);
      } catch {
        if (!cancelled) setHtml(null);
      } finally {
        if (!cancelled) setFetching(false);
      }
    }

    fetchBody();

    return () => { cancelled = true; };
  }, [lang, slug, articleId]);

  if (loading || !articleId) {
    return <ArticleSkeleton />;
  }

  if (fetching) {
    return <ArticleSkeleton />;
  }

  if (!html) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {lang === "zh" ? "文章内容加载失败" : "Failed to load article content"}
      </div>
    );
  }

  return (
    <>
      <WikiPreview lang={lang} />

      <div className="flex gap-8" data-article-body="true">
        <div className="min-w-0 flex-1">
          <article className="flex flex-col gap-8">
            {/* Rendered content — client-rendered HTML */}
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: html }}
            />

            <hr className="border-border" />

            <footer className="flex flex-col gap-8 text-sm">
              <div className="flex items-start gap-2 text-xs text-muted-foreground/60">
                <svg
                  className="size-3 mt-0.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                <p>
                  {new Date().getFullYear()} Miniese&apos;s Blog {" · "} CC BY-NC 4.0
                </p>
              </div>

              <CommentSection articleId={articleId} lang={lang} />
            </footer>
          </article>
        </div>

        {/* Desktop TOC — client component for scroll highlighting */}
        <TableOfContents html={html} lang={lang} />
      </div>
    </>
  );
}
