/**
 * @file LatestArticles — Server component that shows the 5 most recent articles.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { ArticleCard } from "./ArticleCard";

interface LatestArticlesProps {
  lang: string;
}

export async function LatestArticles({ lang }: LatestArticlesProps) {
  const articles = await prisma.article.findMany({
    where: {
      status: "published",
      language: lang as "zh" | "en",
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: {
      slug: true,
      title: true,
      language: true,
      tags: true,
      updatedAt: true,
      summary: true,
      viewCount: true,
      likes: true,
    },
  });

  if (articles.length === 0) return null;

  return (
    <section>
      <h2 className="text-2xl sm:text-3xl font-bold mb-8">
        {lang === "zh" ? "最新文章" : "Latest Articles"}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {articles.map((article) => (
          <ArticleCard
            key={article.slug}
            href={`/${lang}/articles/${article.slug}`}
            title={article.title}
            summary={article.summary}
            tags={article.tags}
            date={article.updatedAt}
            viewCount={article.viewCount}
            likes={article.likes}
            lang={lang}
          />
        ))}
      </div>
      <div className="mt-8 text-center">
        <Link
          href={`/${lang}/articles`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
        >
          {lang === "zh" ? "查看所有文章 →" : "View all articles →"}
        </Link>
      </div>
    </section>
  );
}
