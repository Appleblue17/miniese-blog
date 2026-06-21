/**
 * @file ArticleCard — Card component for homepage article listings.
 *
 * Renders a card with title, summary, tags, date, and stats.
 * Supports compact mode for use in column layout.
 */

import Link from "next/link";
import { Eye, Calendar } from "lucide-react";

function formatViews(count: number): string {
  return `${count} views`;
}

interface ArticleCardProps {
  href: string;
  title: string;
  summary: string | null;
  tags: string[];
  date: Date;
  viewCount: number;
  lang: string;
  compact?: boolean;
}

export function ArticleCard({
  href,
  title,
  summary,
  tags,
  date,
  viewCount,
  lang,
  compact,
}: ArticleCardProps) {
  if (compact) {
    return (
      <Link
        href={href}
        className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:shadow-md hover:border-primary/30"
      >
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
            {title}
          </h3>
          {summary && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {summary}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="size-2.5" />
              {date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="size-2.5" />
              {formatViews(viewCount)}
            </span>
          </div>
        </div>
        {tags.length > 0 && (
          <span className="shrink-0 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {tags[0]}
          </span>
        )}
      </Link>
    );
  }

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
          {formatViews(viewCount)}
        </span>
      </div>
    </Link>
  );
}
