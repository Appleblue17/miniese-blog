/**
 * @file PopularArticles — Server component showing the most read articles.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { ArticleCard } from "./ArticleCard";

interface PopularArticlesProps {
  lang: string;
  count?: number;
}

export async function PopularArticles({ lang, count = 5 }: PopularArticlesProps) {
  const articles = await prisma.article.findMany({
    where: {
      status: "published",
      language: lang as "zh" | "en",
    },
    orderBy: { viewCount: "desc" },
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
        {lang === "zh" ? "热门文章" : "Popular Articles"}
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
          {lang === "zh" ? "查看更多 →" : "See more →"}
        </Link>
      </div>
    </section>
  );
}
