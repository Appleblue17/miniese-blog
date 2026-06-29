/**
 * @file ArticleCard - A card component displaying a single article preview.
 *
 * Used in article list pages to show title, summary, metadata, and tags.
 */

import Link from "next/link";
import { Calendar, Eye, User, Tag, FileText } from "lucide-react";

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
 * Formats a byte count for display (B / KB / MB).
 */
function formatByteSize(bytes: number, _lang: string): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Map language code to display label */
function langLabel(code: string): string {
  return code === "zh" ? "中文" : "EN";
}

export function ArticleCard({ article, lang }: ArticleCardProps) {
  return (
    <Link href={`/${lang}/articles/${article.slug}`} className="block group h-full">
      <Card className="card-article h-full hover:shadow-md">
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
              <FileText className="size-3" />
              {formatByteSize(article.charCount ?? 0, lang)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3" />
              {article.viewCount} views
            </span>
          </div>

          {/* Tags (separate row, like WikiCard) */}
          {article.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag className="size-3 text-muted-foreground shrink-0" />
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
        </CardContent>
      </Card>
    </Link>
  );
}
