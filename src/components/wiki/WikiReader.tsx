/**
 * @file WikiReader - Displays a wiki entry with all its content blocks.
 *
 * Layout (top to bottom):
 * 1. Title area: main name + alias list (badges)
 * 2. Definition block
 * 3. Human notes block
 * 4. AI content block (placeholder if empty)
 * 5. Article references (placeholder)
 * 6. Backlinks (placeholder)
 */

import { Calendar, BookOpen, Bot, User, Quote, Link2, MessageSquare, Sparkles, ShieldCheck, Clock, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { renderMarkdown } from "@/lib/markdown/renderer";
import type { WikiStatus } from "@/types/wiki";

// --- Type badge helpers ---

const TYPE_LABELS: Record<string, string> = {
  acronym: "缩写",
  concept: "概念",
  theorem: "定理",
  tech: "技术",
  other: "其他",
};

const TYPE_COLORS: Record<string, string> = {
  acronym: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  concept: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  theorem: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  tech: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  other: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] || type;
}

function typeColor(type: string): string {
  return TYPE_COLORS[type] || TYPE_COLORS.other;
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
  subtitle,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && (
          <span className="text-xs text-muted-foreground ml-auto">{subtitle}</span>
        )}
      </div>
      <div className="markdown-body">{children}</div>
    </section>
  );
}

export async function WikiReader({ entry, lang }: WikiReaderProps) {
  // Render markdown blocks server-side
  const renderedBlocks = {
    human: entry.blocks.human ? await renderMarkdown(entry.blocks.human, "markdown") : "",
    ai: entry.blocks.ai ? await renderMarkdown(entry.blocks.ai, "markdown") : "",
    ref: entry.blocks.ref ? await renderMarkdown(entry.blocks.ref, "markdown") : "",
  };

  return (
    <article className="flex flex-col gap-8">
      {/* 1. Title area */}
      <header className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <BookOpen className="size-6 mt-1 shrink-0 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">{entry.name}</h1>

            {/* Aliases as badges */}
            {entry.aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {entry.aliases.map((alias) => (
                  <Badge key={alias} variant="secondary">
                    {alias}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Status badges */}
          <div className="flex flex-col gap-1 shrink-0">
            {/* Type badge */}
            {entry.type && (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${typeColor(entry.type)}`}>
                {typeLabel(entry.type)}
              </span>
            )}
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wider"
            >
              {entry.language}
            </Badge>
            {entry.status === "creating" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                <Sparkles className="size-2.5" />
                生成中
              </span>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" />
            {lang === "zh" ? "创建于" : "Created"} {formatDate(entry.createdAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" />
            {lang === "zh" ? "更新于" : "Updated"} {formatDate(entry.updatedAt)}
          </span>
          {entry.status === "reviewed" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
              <ShieldCheck className="size-2.5" />
              {lang === "zh" ? "已审查" : "Reviewed"}
            </span>
          ) : entry.status === "unreviewed" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
              <Clock className="size-2.5" />
              {lang === "zh" ? "待审查" : "Unreviewed"}
            </span>
          ) : null}
        </div>

        {/* Tags */}
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag className="size-3 text-muted-foreground shrink-0" />
            {entry.tags.map((tag) => (
              <Badge key={tag} variant="outline">
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
          subtitle={
            entry.status === "creating"
              ? lang === "zh" ? "AI生成" : "AI-generated"
              : undefined
          }
        >
          <p className="text-base leading-relaxed">
            {entry.blocks.definition || entry.definition}
          </p>
        </SectionBlock>
      )}

      {/* 3. Human notes block */}
      <SectionBlock
        icon={<User className="size-4" />}
        title={lang === "zh" ? "博主笔记" : "Human Notes"}
      >
        {renderedBlocks.human ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedBlocks.human }}
          />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {lang === "zh" ? "暂无博主笔记。" : "No human notes yet."}
          </p>
        )}
      </SectionBlock>

      {/* 4. AI content block */}
      <SectionBlock
        icon={<Bot className="size-4" />}
        title={lang === "zh" ? "助手撰写" : "AI Content"}
        subtitle={
          entry.blocks.ai
            ? entry.status === "reviewed"
              ? lang === "zh" ? "已人工审查" : "Reviewed"
              : lang === "zh" ? "AI生成，待审查" : "AI-generated, unreviewed"
            : undefined
        }
      >
        {renderedBlocks.ai ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedBlocks.ai }}
          />
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 p-4">
            <Bot className="size-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground italic">
              {lang === "zh" ? "待添加" : "Not yet available"}
            </p>
          </div>
        )}
      </SectionBlock>

      {/* 5. References block */}
      <SectionBlock
        icon={<Link2 className="size-4" />}
        title={lang === "zh" ? "参考文献" : "References"}
      >
        {renderedBlocks.ref ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedBlocks.ref }}
          />
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 p-4">
            <Link2 className="size-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground italic">
              {lang === "zh" ? "暂无参考文献。" : "No references yet."}
            </p>
          </div>
        )}
      </SectionBlock>

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
