/**
 * @file ActivityTimeline — Shows recent site activity (article updates).
 *
 * Server component that fetches the most recent article events
 * and displays them as a chronological timeline.
 */

import { prisma } from "@/lib/db";
import Link from "next/link";

interface ActivityTimelineProps {
  lang: string;
  count?: number;
}

export async function ActivityTimeline({ lang, count = 8 }: ActivityTimelineProps) {
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
      updatedAt: true,
    },
  });

  if (articles.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg sm:text-xl font-bold mb-4">
        {lang === "zh" ? "博客动态" : "Activity"}
      </h2>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-6">
          {articles.map((article) => (
            <div key={article.slug} className="relative pl-12">
              {/* Timeline dot */}
              <div className="absolute left-2.5 top-1.5 size-3 rounded-full bg-primary ring-4 ring-background" />

              <div>
                <Link
                  href={`/${lang}/articles/${article.slug}`}
                  className="font-medium hover:text-primary transition-colors"
                >
                  {article.title}
                </Link>
                <p className="text-xs mt-0.5">
                  {lang === "zh" ? "更新" : "Updated"} —{" "}
                  {article.updatedAt.toLocaleDateString(
                    lang === "zh" ? "zh-CN" : "en-US",
                    {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    },
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
