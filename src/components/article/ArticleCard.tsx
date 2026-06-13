/**
 * @file ArticleCard - A card component displaying a single article preview.
 *
 * Used in article list pages to show title, summary, metadata, and tags.
 */

import Link from "next/link";
import { Calendar, Clock, Heart, User, Tag, FileText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ArticleMeta } from "@/types/article";

export interface ArticleCardProps {
  article: ArticleMeta;
  lang: string;
}

/**
 * Formats a date string to a human-readable format.
 */
function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Estimates reading time based on title + summary length.
 */
function estimateReadingTime(article: ArticleMeta): string {
  const text = `${article.title} ${article.summary || ""}`;
  const charCount = text.length;
  const minutes = Math.max(1, Math.round(charCount / 500));
  return `${minutes} min read`;
}

/** Map language code to display label */
function langLabel(code: string): string {
  return code === "zh" ? "中文" : "EN";
}

export function ArticleCard({ article, lang }: ArticleCardProps) {
  return (
    <Link href={`/${lang}/articles/${article.slug}`} className="block group">
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-3 pt-4">
          {/* Title row */}
          <div className="flex items-start gap-2.5">
            <FileText className="size-4 mt-1 shrink-0 text-muted-foreground" />
            <h3 className="flex-1 text-base font-semibold leading-snug group-hover:text-primary-hsl transition-colors">
              {article.title}
            </h3>
            <Badge
              variant="outline"
              className="shrink-0 mt-0.5 text-[10px] uppercase tracking-wider"
            >
              {langLabel(article.language)}
            </Badge>
          </div>

          {/* Summary */}
          {article.summary && (
            <p className="text-sm text-muted-foreground/80 leading-relaxed line-clamp-2">
              {article.summary}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {article.author && (
              <span className="inline-flex items-center gap-1">
                <User className="size-3" />
                {article.author}
              </span>
            )}
            {article.publishedAt && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3" />
                {formatDate(article.publishedAt)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {estimateReadingTime(article)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3" />
              {article.likes}
            </span>
            {article.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Tag className="size-3 shrink-0" />
                {article.tags.map((tag) => (
                  <Badge
                    key={tag}
                    className="bg-primary-tag/15 text-primary-tag border-primary-tag/25 text-[10px]"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
