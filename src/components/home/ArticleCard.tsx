/**
 * @file ArticleCard — Card component for homepage article listings.
 *
 * Renders a compact card with title, summary, tags, date, and stats.
 * Designed for use in LatestArticles and PopularArticles sections.
 */

import Link from "next/link";
import { Eye, ThumbsUp, Calendar } from "lucide-react";

interface ArticleCardProps {
  href: string;
  title: string;
  summary: string | null;
  tags: string[];
  date: Date;
  viewCount: number;
  likes: number;
  lang: string;
}

export function ArticleCard({
  href,
  title,
  summary,
  tags,
  date,
  viewCount,
  likes,
  lang,
}: ArticleCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30"
    >
      <h3 className="font-semibold text-base sm:text-lg line-clamp-2 group-hover:text-primary transition-colors">
        {title}
      </h3>

      {summary && (
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2 flex-1">
          {summary}
        </p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {tags.length > 4 && (
            <span className="text-xs text-muted-foreground">
              +{tags.length - 4}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="size-3" />
          {date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
        <span className="flex items-center gap-1">
          <Eye className="size-3" />
          {viewCount}
        </span>
        {likes > 0 && (
          <span className="flex items-center gap-1">
            <ThumbsUp className="size-3" />
            {likes}
          </span>
        )}
      </div>
    </Link>
  );
}
