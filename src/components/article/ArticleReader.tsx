/**
 * @file ArticleReader - Displays a published article with metadata header and rendered HTML content.
 */

import { Calendar, Clock, Eye, Heart, User, Tag } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface ArticleReaderProps {
  title: string;
  author: string;
  publishedAt: string | null;
  updatedAt: string;
  tags: string[];
  summary: string | null;
  html: string;
  viewCount: number;
  likes: number;
  lang: string;
}

/**
 * Formats a date string to a human-readable format.
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Estimates reading time based on text content length.
 */
function estimateReadingTime(html: string): string {
  // Strip HTML tags and count characters
  const text = html.replace(/<[^>]*>/g, "");
  const charCount = text.length;
  const minutes = Math.max(1, Math.round(charCount / 500));
  return `${minutes} min read`;
}

export function ArticleReader({
  title,
  author,
  publishedAt,
  updatedAt,
  tags,
  summary,
  html,
  viewCount,
  likes,
}: ArticleReaderProps) {
  return (
    <article className="flex flex-col gap-8">
      {/* Header section */}
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold leading-tight tracking-tight">
          {title}
        </h1>

        {/* Metadata bar */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {author && (
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" />
              {author}
            </span>
          )}
          {publishedAt && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {formatDate(publishedAt)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {estimateReadingTime(html)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Eye className="size-3.5" />
            {viewCount}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Heart className="size-3.5" />
            {likes}
          </span>
          <span className="text-xs text-muted-foreground/60">
            更新于 {formatDate(updatedAt)}
          </span>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag className="size-3.5 text-muted-foreground" />
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Summary */}
        {summary && (
          <p className="text-base text-muted-foreground border-l-2 border-muted-foreground/20 pl-4 italic">
            {summary}
          </p>
        )}
      </header>

      {/* Divider */}
      <hr className="border-border" />

      {/* Rendered content */}
      <div
        className="prose prose-neutral dark:prose-invert max-w-none
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-img:rounded-lg prose-code:rounded-md prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm
          prose-pre:rounded-xl prose-pre:border prose-pre:border-border
          prose-blockquote:border-l-primary prose-blockquote:not-italic
          prose-hr:border-border"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
