/**
 * @file WikiCard - A card component displaying a single wiki entry preview.
 *
 * Used in wiki list pages to show name, aliases, definition, and tags.
 * Follows the same styling as ArticleCard.
 */

import Link from "next/link";
import { BookOpen } from "lucide-react";

import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WikiEntryMeta } from "@/types/wiki";

export interface WikiCardProps {
  entry: WikiEntryMeta;
  lang: string;
}

export function WikiCard({ entry, lang }: WikiCardProps) {
  return (
    <Link href={`/${lang}/wiki/${encodeURIComponent(entry.name)}`} className="block group">
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-3 pt-4">
          {/* Title row with language badge */}
          <div className="flex items-start gap-2">
            <BookOpen className="size-4 mt-1 shrink-0 text-muted-foreground" />
            <CardTitle className="flex-1 text-lg group-hover:text-primary transition-colors">
              {entry.name}
            </CardTitle>
            <Badge
              variant="outline"
              className="shrink-0 mt-0.5 text-[10px] uppercase tracking-wider"
            >
              {entry.language}
            </Badge>
          </div>

          {/* Aliases */}
          {entry.aliases.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {entry.aliases.map((alias) => (
                <Badge key={alias} variant="secondary" className="text-[10px]">
                  {alias}
                </Badge>
              ))}
            </div>
          )}

          {/* Definition (truncated) */}
          {entry.definition && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {entry.definition}
            </p>
          )}

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {entry.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Metadata: status badges */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {entry.status === "creating" && (
              <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                生成中
              </span>
            )}
            {entry.status === "reviewed" ? (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700 dark:bg-green-900 dark:text-green-300">
                已审查
              </span>
            ) : entry.status === "unreviewed" ? (
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                待审查
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
