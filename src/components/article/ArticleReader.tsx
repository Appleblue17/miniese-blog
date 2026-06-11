/**
 * @file ArticleReader - Displays a published article with metadata header, rendered HTML content,
 * TOC sidebar, and footer area (copyright, changelog, comments placeholder).
 */

"use client";

import { Calendar, Clock, Eye, Heart, User, Tag, GitCommit, MessageSquare, Copyright } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { TableOfContents } from "@/components/article/TableOfContents";
import { WikiPreview } from "@/components/wiki/WikiPreview";

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
  changelog?: string | null;
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
  lang,
  changelog,
}: ArticleReaderProps) {
  return (
    <div className="relative flex gap-8">
      <WikiPreview lang={lang} />

      {/* Main content */}
      <div className="min-w-0 flex-1">
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
                {lang === "zh" ? "更新于" : "Updated"} {formatDate(updatedAt)}
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
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {/* Divider before footer */}
          <hr className="border-border" />

          {/* Footer area */}
          <footer className="flex flex-col gap-8 text-sm">
            {/* Copyright */}
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <Copyright className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  &copy; {new Date().getFullYear()} {author || "Miniese's Blog"}
                </p>
                <p className="text-muted-foreground mt-1">
                  {lang === "zh"
                    ? "除非另有说明，本作品采用知识共享署名-非商业性使用 4.0 国际许可协议进行许可。"
                    : "This work is licensed under a Creative Commons Attribution-NonCommercial 4.0 International License, unless otherwise noted."}
                </p>
              </div>
            </div>

            {/* Changelog */}
            {changelog && (
              <div className="flex items-start gap-3 rounded-lg border border-border p-4">
                <GitCommit className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {lang === "zh" ? "更新记录" : "Changelog"}
                  </p>
                  <p className="text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                    <span className="text-xs text-muted-foreground/60 mr-2">
                      {formatDate(updatedAt)}
                    </span>
                    {changelog}
                  </p>
                </div>
              </div>
            )}

            {/* Comments placeholder */}
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-muted-foreground/30 p-6">
              <MessageSquare className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium text-muted-foreground">
                  {lang === "zh" ? "评论区" : "Comments"}
                </p>
                <p className="text-muted-foreground/60 mt-1">
                  {lang === "zh"
                    ? "评论功能开发中，敬请期待。"
                    : "Comments are under development. Stay tuned."}
                </p>
              </div>
            </div>
          </footer>
        </article>
      </div>

      {/* Desktop TOC sidebar */}
      <TableOfContents html={html} />
    </div>
  );
}
