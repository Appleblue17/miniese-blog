/**
 * @file /{lang}/articles/{slug} - Article reading page.
 *
 * Displays a single published article with rendered HTML content.
 * Uses server-side data fetching via the internal API route.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

import { ArticleReader } from "@/components/article/ArticleReader";

interface Props {
  params: Promise<{ lang: string; slug: string }>;
}

interface ArticleApiResponse {
  article: {
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
  };
  html: string;
}

async function fetchArticle(lang: string, slug: string): Promise<ArticleApiResponse | null> {
  try {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const url = `${baseUrl}/api/articles/${slug}?lang=${lang}`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;

  const data = await fetchArticle(lang, slug);
  if (!data) return { title: "Not Found" };

  return {
    title: `${data.article.title} | Miniese's Blog`,
    description: data.article.summary || undefined,
    openGraph: {
      title: data.article.title,
      description: data.article.summary || undefined,
      type: "article",
      publishedTime: data.article.publishedAt || undefined,
      tags: data.article.tags,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { lang, slug } = await params;

  // Validate language
  if (lang !== "zh" && lang !== "en") {
    notFound();
  }

  const data = await fetchArticle(lang, slug);
  if (!data) {
    notFound();
  }

  return (
    <div
      className="mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12"
      style={{ maxWidth: "var(--body-width, 48rem)" }}
    >
      {/* Back button — on desktop, positioned to the left of the container using negative margin;
          on mobile, inline at the top. Uses a flex layout to avoid float overlap issues. */}
      <div className="flex items-start gap-3">
        <Link
          href={`/${lang}/articles`}
          className="hidden xl:inline-flex items-center justify-center rounded-lg -ml-12 mt-1 size-9 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={lang === "zh" ? "返回文章列表" : "Back to articles"}
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          {/* Mobile back button — positioned at the top of the content area,
              safe from the navbar hamburger (top-left) and ActionBar (top-right) */}
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
            articleId={data.article.id}
            title={data.article.title}
            author={data.article.author}
            publishedAt={data.article.publishedAt}
            updatedAt={data.article.updatedAt}
            tags={data.article.tags}
            summary={data.article.summary}
            html={data.html}
            viewCount={0}
            likes={0}
            lang={lang}
            changelog={data.article.changelog}
            isAITranslated={data.article.isAITranslated}
          />
        </div>
      </div>
    </div>
  );
}
