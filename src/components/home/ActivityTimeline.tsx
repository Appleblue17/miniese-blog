/**
 * @file ActivityTimeline — Shows recent site activity (article updates).
 *
 * Server component that fetches the most recent 10 article events
 * and displays them as a chronological timeline.
 * Uses updatedAt since the Article model has no separate createdAt field.
 */

import { prisma } from "@/lib/db";
import { FileText } from "lucide-react";
import Link from "next/link";

interface ActivityTimelineProps {
  lang: string;
}

export async function ActivityTimeline({ lang }: ActivityTimelineProps) {
  // Fetch recent articles for activity timeline
  const articles = await prisma.article.findMany({
    where: {
      status: "published",
      language: lang as "zh" | "en",
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      slug: true,
      title: true,
      updatedAt: true,
    },
  });

  if (articles.length === 0) return null;

  return (
    <section>
      <h2 className="text-2xl sm:text-3xl font-bold mb-8">
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

              {/* Icon */}
              <div className="absolute left-1 top-1">
                <FileText className="size-5 text-primary" />
              </div>

              <div>
                <Link
                  href={`/${lang}/articles/${article.slug}`}
                  className="font-medium hover:text-primary transition-colors"
                >
                  {article.title}
                </Link>
                <p className="text-xs text-muted-foreground mt-0.5">
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
