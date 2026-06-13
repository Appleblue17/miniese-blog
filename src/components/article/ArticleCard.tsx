/**
 * @file ArticleCard - A card component displaying a single article preview.
 *
 * Used in article list pages to show title, summary, metadata, and tags.
 */

import Link from "next/link";
import { Calendar, Clock, Eye, Heart, User, Tag, FileText } from "lucide-react";

import { Card, CardContent, CardTitle } from "@/components/ui/card";
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
 * Average reading speed: ~200 Chinese characters or ~150 English words per minute.
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
        <CardContent className="flex flex-col gap-2.5 pt-4">
          {/* Title row with icon and language badge */}
          <div className="flex items-start gap-2">
            <FileText className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
            <CardTitle className="flex-1 text-lg group-hover:text-primary-hsl transition-colors">
              {article.title}
            </CardTitle>
            <Badge
              variant="outline"
              className="shrink-0 mt-0.5 text-[10px] uppercase tracking-wider"
            >
              {langLabel(article.language)}
            </Badge>
          </div>

          {/* Summary */}
          {article.summary && (
            <p className="text-sm text-muted-foreground line-clamp-2">{article.summary}</p>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
              <Eye className="size-3" />
              {article.viewCount}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3" />
              {article.likes}
            </span>
          </div>

          {/* Tags */}
          {article.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag className="size-3 text-muted-foreground shrink-0" />
              {article.tags.map((tag) => (
                <Badge
                  key={tag}
                  className="bg-primary-hsl/10 text-primary-hsl border-primary-hsl/20 text-[10px]"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
