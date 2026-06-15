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
    <div className="mx-auto px-4 py-8" style={{ maxWidth: "var(--body-width, 48rem)" }}>
      {/* Back button — on desktop, sticky left sidebar; on mobile, inline top */}
      <div className="mb-4 md:mb-0 md:sticky md:top-24 md:float-left md:-ml-12 md:mr-2">
        <Link
          href={`/${lang}/articles`}
          className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[44px] min-w-[44px]"
          aria-label={lang === "zh" ? "返回文章列表" : "Back to articles"}
        >
          <ArrowLeft className="size-5" />
        </Link>
      </div>
      <div className="min-w-0">
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
  );
}
