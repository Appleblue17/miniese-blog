/**
 * @file WikiCard - A card component displaying a single wiki entry preview.
 *
 * Used in wiki list pages to show name, aliases, definition, and tags.
 * Follows the same styling as ArticleCard.
 */

import Link from "next/link";
import { BookOpen, Sparkles, ShieldCheck, Clock, Tag } from "lucide-react";

import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WikiEntryMeta } from "@/types/wiki";

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

function getTypeLabel(type: string, lang: string): string {
  const labels = lang === "en" ? TYPE_LABELS_EN : TYPE_LABELS_ZH;
  return labels[type] || type;
}

function getTypeColor(type: string): string {
  return TYPE_COLORS[type] || TYPE_COLORS.other;
}

/** Map language code to display label */
function langLabel(code: string): string {
  return code === "zh" ? "中文" : "EN";
}

export interface WikiCardProps {
  entry: WikiEntryMeta;
  lang: string;
}

export function WikiCard({ entry, lang }: WikiCardProps) {
  return (
    <Link href={`/${lang}/wiki/${encodeURIComponent(entry.name)}`} className="block group">
      <Card className="transition-shadow hover:shadow-md h-full">
        <CardContent className="flex flex-col gap-2.5 pt-4">
          {/* Title row: icon + name + type + status + language — all in one line */}
          <div className="flex items-start gap-2">
            <BookOpen className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
            <CardTitle className="flex-1 text-base group-hover:text-primary-hsl transition-colors leading-snug">
              {entry.name}
            </CardTitle>

            {/* Compact right-side badges row */}
            <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
              {/* Type badge */}
              {entry.type && (
                <span
                  className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-tight ${getTypeColor(entry.type)}`}
                >
                  {getTypeLabel(entry.type, lang)}
                </span>
              )}

              {/* Status badge — compact */}
              {entry.status === "creating" && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-hsl/10 px-1.5 py-0.5 text-[9px] font-medium text-accent-hsl leading-tight">
                  <Sparkles className="size-2.5" />
                  {lang === "en" ? "Generating" : "生成中"}
                </span>
              )}
              {entry.status === "reviewed" && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-medium text-green-700 dark:bg-green-900/50 dark:text-green-300 leading-tight">
                  <ShieldCheck className="size-2.5" />
                  {lang === "en" ? "Reviewed" : "已审查"}
                </span>
              )}
              {entry.status === "unreviewed" && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[9px] font-medium text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300 leading-tight">
                  <Clock className="size-2.5" />
                  {lang === "en" ? "Unreviewed" : "待审查"}
                </span>
              )}

              <Badge
                variant="outline"
                className="text-[9px] uppercase tracking-wider leading-tight px-1.5 py-0.5"
              >
                {langLabel(entry.language)}
              </Badge>
            </div>
          </div>

          {/* Aliases */}
          {entry.aliases.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entry.aliases.map((alias) => (
                <Badge key={alias} variant="secondary" className="text-[9px] px-1.5 py-0.5">
                  {alias}
                </Badge>
              ))}
            </div>
          )}

          {/* Definition (truncated) */}
          {entry.definition && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-snug">
              {entry.definition}
            </p>
          )}

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Tag className="size-3 text-muted-foreground shrink-0" />
              {entry.tags.map((tag) => (
                <Badge
                  key={tag}
                  className="bg-primary-tag/15 text-primary-tag border-primary-tag/25 text-[9px] px-1.5 py-0.5"
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
