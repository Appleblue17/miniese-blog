/**
 * @file WikiReader - Displays a wiki entry with all its content blocks.
 *
 * Layout (top to bottom):
 * 1. Title area: main name + alias list + metadata
 * 2. Definition block
 * 3. Human notes block
 * 4. AI content block
 * 5. References block
 * 6. Backlinks (placeholder)
 *
 * Empty sections (no content) are hidden entirely rather than showing a placeholder.
 */

import {
  Calendar,
  BookOpen,
  Bot,
  User,
  Quote,
  Link2,
  MessageSquare,
  ShieldCheck,
  Clock,
  Tag,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { renderMarkdown } from "@/lib/markdown/renderer";
import type { WikiStatus } from "@/types/wiki";

// --- Type badge helpers ---

const TYPE_LABELS_ZH: Record<string, string> = {
  acronym: "缩写",
  concept: "概念",
  theorem: "定理",
  tech: "技术",
  other: "其他",
};

const TYPE_LABELS_EN: Record<string, string> = {
  acronym: "Acronym",
  concept: "Concept",
  theorem: "Theorem",
  tech: "Tech",
  other: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  acronym: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  concept: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  theorem: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  tech: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  other: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function typeLabel(type: string, lang: string): string {
  const labels = lang === "en" ? TYPE_LABELS_EN : TYPE_LABELS_ZH;
  return labels[type] || type;
}

function typeColor(type: string): string {
  return TYPE_COLORS[type] || TYPE_COLORS.other;
}

function langLabel(language: string): string {
  return language === "zh" ? "中文" : "EN";
}

interface WikiReaderEntry {
  name: string;
  aliases: string[];
  language: string;
  definition: string;
  tags: string[];
  type: string;
  accessGroup: string[];
  status: WikiStatus;
  createdAt: string;
  updatedAt: string;
  blocks: {
    definition: string;
    human: string;
    ai: string;
    ref: string;
  };
}

interface WikiReaderProps {
  entry: WikiReaderEntry;
  lang: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Section wrapper for consistent block styling.
 */
function SectionBlock({
  icon,
  title,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2 border-b border-border pb-1.5">
        <span className="text-primary shrink-0">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="markdown-body">{children}</div>
    </section>
  );
}

/**
 * Review status badge — shown inline next to the AI Content title.
 */
function ReviewBadge({ status, lang }: { status: WikiStatus; lang: string }) {
  if (status === "reviewed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-green-100/60 px-1.5 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
        <ShieldCheck className="size-3" />
        {lang === "zh" ? "已审查" : "Reviewed"}
      </span>
    );
  }
  if (status === "unreviewed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-yellow-100/60 px-1.5 py-0.5 text-[11px] font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
        <Clock className="size-3" />
        {lang === "zh" ? "待审查" : "Unreviewed"}
      </span>
    );
  }
  return null;
}

export async function WikiReader({ entry, lang }: WikiReaderProps) {
  // Render markdown blocks server-side
  const renderedBlocks = {
    human: entry.blocks.human ? await renderMarkdown(entry.blocks.human, "markdown") : "",
    ai: entry.blocks.ai ? await renderMarkdown(entry.blocks.ai, "markdown") : "",
    ref: entry.blocks.ref ? await renderMarkdown(entry.blocks.ref, "markdown") : "",
  };

  return (
    <article className="flex flex-col gap-6">
      {/* 1. Title area */}
      <header className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <BookOpen className="size-6 shrink-0 text-primary mt-1" />
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">{entry.name}</h1>
          </div>
          <a
            href={`/api/wiki/content?name=${encodeURIComponent(entry.name)}&lang=${entry.language}&download=1`}
            download
            className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border size-9 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mt-1"
            title={lang === "zh" ? "下载源文件" : "Download source"}
          >
            <Download className="size-4" />
          </a>
        </div>

        {/* Aliases */}
        {entry.aliases.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entry.aliases.map((alias) => (
              <span
                key={alias}
                className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {alias}
              </span>
            ))}
          </div>
        )}

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" />
            {lang === "zh" ? "创建于" : "Created"} {formatDate(entry.createdAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" />
            {lang === "zh" ? "更新于" : "Updated"} {formatDate(entry.updatedAt)}
          </span>
          {entry.type && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeColor(entry.type)}`}
            >
              {typeLabel(entry.type, lang)}
            </span>
          )}
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {langLabel(entry.language)}
          </span>
          {entry.status === "reviewed" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
              <ShieldCheck className="size-3" />
              {lang === "zh" ? "已审查" : "Reviewed"}
            </span>
          ) : entry.status === "unreviewed" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
              <Clock className="size-3" />
              {lang === "zh" ? "待审查" : "Unreviewed"}
            </span>
          ) : null}
        </div>

        {/* Tags */}
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag className="size-3 text-muted-foreground shrink-0" />
            {entry.tags.map((tag) => (
              <Badge
                key={tag}
                className="bg-primary-tag/15 text-primary-tag border-primary-tag/25"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </header>

      <hr className="border-border" />

      {/* 2. Definition block */}
      {(entry.blocks.definition || entry.definition) && (
        <SectionBlock
          icon={<Quote className="size-4" />}
          title={lang === "zh" ? "定义" : "Definition"}
        >
          <p className="text-base leading-relaxed">{entry.blocks.definition || entry.definition}</p>
        </SectionBlock>
      )}

      {/* 3. Human notes block — only show if there's content */}
      {renderedBlocks.human && (
        <SectionBlock
          icon={<User className="size-4" />}
          title={lang === "zh" ? "博主笔记" : "Human Notes"}
        >
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedBlocks.human }}
          />
        </SectionBlock>
      )}

      {/* 4. AI content block — only show if there's content */}
      {renderedBlocks.ai && (
        <SectionBlock
          icon={<Bot className="size-4" />}
          title={
            <span className="inline-flex items-center gap-2">
              {lang === "zh" ? "助手撰写" : "AI Content"}
              <ReviewBadge status={entry.status} lang={lang} />
            </span>
          }
        >
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedBlocks.ai }}
          />
        </SectionBlock>
      )}

      {/* 5. References block — only show if there's content */}
      {renderedBlocks.ref && (
        <SectionBlock
          icon={<Link2 className="size-4" />}
          title={lang === "zh" ? "参考文献" : "References"}
        >
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedBlocks.ref }}
          />
        </SectionBlock>
      )}

      {/* 6. Backlinks (placeholder) */}
      <SectionBlock
        icon={<MessageSquare className="size-4" />}
        title={lang === "zh" ? "引用了此词条的文章" : "Linked Articles"}
      >
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 p-4">
          <MessageSquare className="size-4 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground italic">
            {lang === "zh"
              ? "暂无文章引用此词条。自动链接功能开发中。"
              : "No articles reference this entry yet. Auto-linking is under development."}
          </p>
        </div>
      </SectionBlock>
    </article>
  );
}
