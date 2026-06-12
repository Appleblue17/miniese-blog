"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Sparkles,
  Languages,
  Eye,
  EyeOff,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────

/** A single translation group with optional surrounding context */
interface TranslateChunk {
  /** Sequential ID matching the chunk position (0-based) */
  chunkId: number;
  /** Chunk title / heading text */
  title: string;
  /** Original source text of this chunk (target lines only) */
  sourceText: string;
  /** AI-translated text of this chunk (target lines only) */
  translatedText: string;
  /** Whether this chunk was reused from a previous translation (not re-translated) */
  reused: boolean;
  /** Whether this is context-only (no target lines) — unused now */
  context: boolean;
  /** Line range in the source file */
  startLine: number;
  endLine: number;
  /** Whether this chunk has above/below context attached */
  hasContext?: boolean;
  /** Optional context text shown above the diff (original language only) */
  aboveContext?: string;
  /** Optional context text shown below the diff (original language only) */
  belowContext?: string;
}

interface TranslateChunkListProps {
  chunks: TranslateChunk[];
  sourceLanguage?: string;
  targetLanguage?: string;
}

// ─── Language badge colors ───────────────────────────────────────────────

const LANG_LABELS: Record<string, string> = {
  zh: "中文",
  en: "English",
};

const LANG_COLORS: Record<string, { bg: string; text: string }> = {
  zh: { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-300" },
  en: { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300" },
};

function LangBadge({ lang }: { lang: string }) {
  const c = LANG_COLORS[lang] ?? { bg: "bg-slate-100", text: "text-slate-700" };
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${c.bg} ${c.text}`}>
      {LANG_LABELS[lang] ?? lang}
    </span>
  );
}

// ─── Collapsible chunk card ──────────────────────────────────────────────

function ChunkCard({
  chunk,
  sourceLanguage,
  targetLanguage,
  showContext,
}: {
  chunk: TranslateChunk;
  sourceLanguage: string;
  targetLanguage: string;
  showContext: boolean;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const hasContext = !!(chunk.aboveContext || chunk.belowContext);

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Clickable header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {collapsed ? (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="font-semibold text-sm truncate">
            段落 {chunk.chunkId + 1}: {chunk.title}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {chunk.reused ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 text-[10px] font-medium">
              <Check className="size-3" />
              复用
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 text-[10px] font-medium">
              <Sparkles className="size-3" />
              翻译
            </span>
          )}
          <span className="text-[9px] text-muted-foreground font-mono">
            行 {chunk.startLine}–{chunk.endLine}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {!collapsed && (
        <div className="border-t border-border">
          {/* Above context */}
          {hasContext && showContext && chunk.aboveContext && (
            <div className="border-b border-border bg-muted/20 px-4 py-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">上文（仅参考）</span>
              </div>
              <pre className="text-[9px] leading-relaxed text-muted-foreground bg-muted/30 rounded-md p-2 overflow-x-auto font-mono whitespace-pre-wrap">
                {chunk.aboveContext}
              </pre>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Source column */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <LangBadge lang={sourceLanguage} />
                <span className="text-xs font-medium text-muted-foreground">原文</span>
              </div>
              <pre className="text-xs leading-relaxed text-foreground bg-muted/50 rounded-md p-3 overflow-x-auto font-mono whitespace-pre-wrap">
                {chunk.sourceText}
              </pre>
            </div>

            {/* Translation column */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <LangBadge lang={targetLanguage} />
                <span className="text-xs font-medium text-muted-foreground">翻译</span>
                {chunk.reused && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                    <Check className="size-3" />
                    复用上次结果
                  </span>
                )}
              </div>
              <pre className="text-xs leading-relaxed text-foreground bg-blue-50/50 dark:bg-blue-950/20 rounded-md p-3 overflow-x-auto font-mono whitespace-pre-wrap">
                {chunk.translatedText}
              </pre>
            </div>
          </div>

          {/* Below context */}
          {hasContext && showContext && chunk.belowContext && (
            <div className="border-t border-border bg-muted/20 px-4 py-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">下文（仅参考）</span>
              </div>
              <pre className="text-[11px] leading-relaxed text-muted-foreground bg-muted/30 rounded-md p-2 overflow-x-auto font-mono whitespace-pre-wrap">
                {chunk.belowContext}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────

export default function TranslateChunkList({
  chunks,
  sourceLanguage = "zh",
  targetLanguage = "en",
}: TranslateChunkListProps) {
  const [showContext, setShowContext] = useState(true);
  const hasAnyContext = chunks.some((c) => c.hasContext);

  return (
    <div className="flex flex-col gap-4">
      {/* Global context toggle */}
      {hasAnyContext && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowContext(!showContext)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {showContext ? (
              <><Eye className="size-3.5" />显示上下文</>
            ) : (
              <><EyeOff className="size-3.5" />隐藏上下文</>
            )}
          </button>
        </div>
      )}

      {chunks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Languages className="size-8" />
          <p className="text-sm">暂无翻译段落</p>
        </div>
      ) : (
        chunks.map((chunk) => (
          <ChunkCard
            key={chunk.chunkId}
            chunk={chunk}
            sourceLanguage={sourceLanguage}
            targetLanguage={targetLanguage}
            showContext={showContext}
          />
        ))
      )}
    </div>
  );
}
