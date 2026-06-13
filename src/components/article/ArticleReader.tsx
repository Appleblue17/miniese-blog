/**
 * @file ArticleReader - Displays a published article with metadata header, rendered HTML content,
 * TOC sidebar, and footer area (copyright, changelog, comments placeholder).
 */

"use client";

import {
  Calendar,
  Clock,
  User,
  Tag,
  GitCommit,
  MessageSquare,
  Copyright,
} from "lucide-react";

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
  isAITranslated?: boolean;
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
  isAITranslated,
}: ArticleReaderProps) {
  return (
    <div className="relative flex gap-8">
      <WikiPreview lang={lang} />

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <article className="flex flex-col gap-8">
          {/* Header section */}
          <header className="flex flex-col gap-4">
            <h1 className="text-3xl font-bold leading-tight tracking-tight">{title}</h1>

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
              <span className="text-xs text-muted-foreground/60">
                {lang === "zh" ? "更新于" : "Updated"} {formatDate(updatedAt)}
              </span>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Tag className="size-3.5 text-muted-foreground" />
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    className="bg-primary-tag/15 text-primary-tag border-primary-tag/25"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Divider before summary */}
            {summary && <hr className="border-border" />}

            {/* Summary */}
            {summary && (
              <div className="markdown-body-summary">
                <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
              </div>
            )}

            {/* AI Translation notice */}
            {isAITranslated && (
              <div className="flex items-center gap-2 rounded-lg border border-accent-hsl/30 bg-ai-bg px-4 py-3 text-sm" style={{ color: 'hsl(var(--accent-hue), var(--accent-sat), 80%)' }}>
                <svg
                  className="size-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"
                  />
                </svg>
                <span>
                  {lang === "zh"
                    ? "本文由 AI 自动翻译，可能存在不准确之处。"
                    : "This article is AI-translated. Some inaccuracies may exist."}
                </span>
              </div>
            )}
          </header>

          {/* Rendered content */}
          <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />

          {/* Divider before footer */}
          <hr className="border-border" />

          {/* Footer area */}
          <footer className="flex flex-col gap-8 text-sm">
            {/* Copyright */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground/60">
              <Copyright className="size-3 mt-0.5 shrink-0" />
              <p>
                {new Date().getFullYear()} {author || "Miniese's Blog"}
                {" · "}
                {lang === "zh"
                  ? "CC BY-NC 4.0"
                  : "CC BY-NC 4.0"}
              </p>
            </div>

            {/* Changelog */}
            {changelog && (
              <div className="flex items-start gap-3 rounded-lg border border-border p-4">
                <GitCommit className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-medium">{lang === "zh" ? "更新记录" : "Changelog"}</p>
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
