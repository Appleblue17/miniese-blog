/**
 * @file /{lang}/articles/{slug} - Article reading page.
 *
 * Client-side two-step rendering for incremental display:
 * 1. ArticleReader loads with skeleton placeholders (loading prop).
 * 2. After meta fetch completes → skeleton replaced by real header content.
 * 3. ArticleContent internally fetches body → renders content + TOC.
 *
 * The article <article> element is always present, avoiding layout shifts.
 * Skeletons match the exact structure of real content for smooth transition.
 */

"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ArticleReader } from "@/components/article/ArticleReader";
import { ArticleContent } from "@/components/article/ArticleContent";
import { ArticleLoadingOverlay } from "@/components/article/ArticleLoadingOverlay";

interface ArticleMeta {
  id: string;
  slug: string;
  title: string;
  language: string;
  summary: string | null;
  tags: string[];
  author: string;
  publishedAt: string | null;
  updatedAt: string;
  changelog: string | null;
  isAITranslated: boolean;
  viewCount: number;
  charCount: number;
}

export default function ArticlePage() {
  const params = useParams();
  const lang = params.lang as string;
  const slug = params.slug as string;

  const [meta, setMeta] = useState<ArticleMeta | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;

    async function fetchMeta() {
      try {
        const res = await fetch(`/api/articles/${slug}?lang=${lang}&fields=meta`);
        if (!res.ok) {
          if (!cancelled) setMeta(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) setMeta(data.article || null);
      } catch {
        if (!cancelled) setMeta(null);
      }
    }

    fetchMeta();

    return () => { cancelled = true; };
  }, [lang, slug]);

  // Increment view count on mount (once per session via sessionStorage on client side)
  useEffect(() => {
    const key = `viewed-${slug}-${lang}`;
    if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      fetch(`/api/articles/${slug}/view?lang=${lang}`, { method: "POST" }).catch(() => {
        // Non-critical; ignore errors
      });
    }
  }, [lang, slug]);

  if (lang !== "zh" && lang !== "en") {
    notFound();
  }

  if (meta === "loading") {
    return (
      <div
        className="mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12"
        style={{ maxWidth: "var(--body-width, 48rem)" }}
      >
        <div className="flex items-start gap-3">
          <div className="hidden xl:block size-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <ArticleReader loading lang={lang} />
            <ArticleContent loading lang={lang} slug={slug} />
          </div>
        </div>

        {/* Overlay on top of skeletons — visible until body DOM appears */}
        <ArticleLoadingOverlay lang={lang} />
      </div>
    );
  }

  if (!meta) {
    notFound();
  }

  return (
    <div
      className="mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12"
      style={{ maxWidth: "var(--body-width, 48rem)" }}
    >
      <div className="flex items-start gap-3">
        <Link
          href={`/${lang}/articles`}
          className="hidden xl:inline-flex items-center justify-center rounded-lg -ml-12 mt-1 size-9 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={lang === "zh" ? "返回文章列表" : "Back to articles"}
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="lg:ml-0 ml-12 xl:hidden mb-4">
            <Link
              href={`/${lang}/articles`}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={lang === "zh" ? "返回文章列表" : "Back to articles"}
            >
              <ArrowLeft className="size-4" />
              {lang === "zh" ? "返回" : "Back"}
            </Link>
          </div>

          <ArticleReader
            articleId={meta.id}
            title={meta.title}
            author={meta.author}
            publishedAt={meta.publishedAt}
            updatedAt={meta.updatedAt}
            tags={meta.tags}
            summary={meta.summary}
            lang={lang}
            changelog={meta.changelog}
            isAITranslated={meta.isAITranslated}
            viewCount={meta.viewCount}
            charCount={meta.charCount}
          />

          <ArticleContent lang={lang} slug={slug} articleId={meta.id} />
        </div>
      </div>

      {/* Overlay remains visible during step 2 (meta ready, body loading) */}
      {/* Hides automatically when [data-article-body] enters the DOM */}
      <ArticleLoadingOverlay lang={lang} />
    </div>
  );
}
