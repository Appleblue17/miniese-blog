/**
 * @file LatestArticles — Server component showing recent articles.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { ArticleCard } from "./ArticleCard";

interface LatestArticlesProps {
  lang: string;
  count?: number;
}

export async function LatestArticles({ lang, count = 5 }: LatestArticlesProps) {
  const articles = await prisma.article.findMany({
    where: {
      status: "published",
      language: lang as "zh" | "en",
    },
    orderBy: { updatedAt: "desc" },
    take: count,
    select: {
      slug: true,
      title: true,
      language: true,
      tags: true,
      updatedAt: true,
      summary: true,
      viewCount: true,
    },
  });

  if (articles.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg sm:text-xl font-bold mb-4">
        {lang === "zh" ? "最新文章" : "Latest Articles"}
      </h2>
      <div className="space-y-3">
        {articles.map((article) => (
          <ArticleCard
            key={article.slug}
            href={`/${lang}/articles/${article.slug}`}
            title={article.title}
            summary={article.summary}
            tags={article.tags}
            date={article.updatedAt}
            viewCount={article.viewCount}
            lang={lang}
            compact
          />
        ))}
      </div>
      <div className="mt-4 text-center">
        <Link
          href={`/${lang}/articles`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
        >
          {lang === "zh" ? "查看所有文章 →" : "View all articles →"}
        </Link>
      </div>
    </section>
  );
}
