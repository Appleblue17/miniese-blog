"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, AlertCircle, AlertTriangle, Info, Check } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────

interface ReviewItem {
  severity: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  issue: string;
  suggestion: string;
}

interface ReviewSection {
  type: string;
  title: string;
  items: ReviewItem[];
}

interface ReviewChunk {
  chunkId: number;
  chunkTitle: string;
  startLine: number;
  endLine: number;
  sections: ReviewSection[];
}

interface ReviewChunkListProps {
  chunks: ReviewChunk[];
}

// ─── Severity helpers ────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  error: 0,
  warning: 1,
  suggestion: 2,
  ok: 3,
};

const SEVERITY_LABELS: Record<string, string> = {
  error: "错误",
  warning: "警告",
  suggestion: "建议",
  ok: "已确认",
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  error: {
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-500",
  },
  warning: {
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    text: "text-yellow-700 dark:text-yellow-300",
    border: "border-yellow-200 dark:border-yellow-800",
    dot: "bg-yellow-500",
  },
  suggestion: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
    dot: "bg-blue-500",
  },
  ok: {
    bg: "bg-green-50 dark:bg-green-950/30",
    text: "text-green-700 dark:text-green-300",
    border: "border-green-200 dark:border-green-800",
    dot: "bg-green-500",
  },
};

const SECTION_COLORS: Record<string, { label: string; bg: string; text: string; border: string }> =
  {
    factual: {
      label: "事实性错误",
      bg: "bg-red-50 dark:bg-red-950/30",
      text: "text-red-700 dark:text-red-300",
      border: "border-red-200 dark:border-red-800",
    },
    typo: {
      label: "拼写与语法",
      bg: "bg-yellow-50 dark:bg-yellow-950/30",
      text: "text-yellow-700 dark:text-yellow-300",
      border: "border-yellow-200 dark:border-yellow-800",
    },
    clarity: {
      label: "表达歧义与通顺性",
      bg: "bg-purple-50 dark:bg-purple-950/30",
      text: "text-purple-700 dark:text-purple-300",
      border: "border-purple-200 dark:border-purple-800",
    },
    other: {
      label: "其他建议",
      bg: "bg-slate-50 dark:bg-slate-950/30",
      text: "text-slate-700 dark:text-slate-300",
      border: "border-slate-200 dark:border-slate-800",
    },
  };

function severitySort(a: { severity: string }, b: { severity: string }): number {
  return (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
}

/** All severity keys, ordered by severity (error → ok) */
const ALL_SEVERITIES = Object.keys(SEVERITY_ORDER);

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "error":
      return <AlertCircle className="size-4 text-red-500 shrink-0 mt-0.5" />;
    case "warning":
      return <AlertTriangle className="size-4 text-yellow-500 shrink-0 mt-0.5" />;
    case "suggestion":
      return <Info className="size-4 text-blue-500 shrink-0 mt-0.5" />;
    case "ok":
      return <Check className="size-4 text-green-500 shrink-0 mt-0.5" />;
    default:
      return <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />;
  }
}

function SeverityBadge({ severity }: { severity: string }) {
  const c = SEVERITY_COLORS[severity] ?? {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "",
    dot: "bg-slate-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${c.bg} ${c.text}`}
    >
      <span className={`size-1.5 rounded-full ${c.dot}`} />
      {SEVERITY_LABELS[severity] ?? severity}
    </span>
  );
}

function SectionBadge({ type }: { type: string }) {
  const c = SECTION_COLORS[type] ?? {
    label: type,
    bg: "",
    text: "text-muted-foreground",
    border: "",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border ${c.border} ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

// ─── Filter: severity threshold ──────────────────────────────────────────

/** Ordered severity levels from most to least severe */
const SEVERITY_THRESHOLDS = [
  { value: "error", label: ">= 错误" },
  { value: "warning", label: ">= 警告" },
  { value: "suggestion", label: ">= 建议" },
  { value: "ok", label: "全部" },
] as const;

function FilterMenu({
  minSeverity,
  onChange,
}: {
  minSeverity: string;
  onChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const currentLabel = SEVERITY_THRESHOLDS.find((t) => t.value === minSeverity)?.label ?? ">= 错误";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        {currentLabel}
        <ChevronDown className="size-3" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Menu */}
          <div className="absolute right-0 top-full mt-1 z-50 min-w-36 rounded-lg border border-border bg-card p-1.5 shadow-lg">
            {SEVERITY_THRESHOLDS.map(({ value, label }) => {
              const isSelected = minSeverity === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    onChange(value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors text-left
                    ${isSelected ? "bg-accent font-medium" : "hover:bg-accent/50"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Collapsible chunk ───────────────────────────────────────────────────

function ChunkCard({ chunk, maxOrder }: { chunk: ReviewChunk; maxOrder: number }) {
  const [collapsed, setCollapsed] = useState(true);

  // Flatten all items, sort, and filter by severity threshold
  const allItems = useMemo(
    () =>
      chunk.sections
        .flatMap((s) => s.items)
        .sort(severitySort)
        .filter((i) => {
          const order = SEVERITY_ORDER[i.severity] ?? 99;
          return order <= maxOrder;
        }),
    [chunk, maxOrder],
  );

  // Counts per severity for the header badge (always all items)
  const countsBySeverity = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of chunk.sections.flatMap((s) => s.items)) {
      counts[item.severity] = (counts[item.severity] ?? 0) + 1;
    }
    return counts;
  }, [chunk]);

  if (allItems.length === 0) return null;

  return (
    <div className="card-base rounded-lg border border-border bg-card">
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
            {chunk.chunkTitle
              ? `段落 ${chunk.chunkId + 1}: ${chunk.chunkTitle}`
              : `段落 ${chunk.chunkId + 1}`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {/* Severity counts as colored dots */}
          {ALL_SEVERITIES.map((sev) => {
            const count = countsBySeverity[sev];
            if (!count) return null;
            const c = SEVERITY_COLORS[sev];
            return (
              <span
                key={sev}
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${c?.bg ?? ""} ${c?.text ?? ""}`}
              >
                <span className={`size-1.5 rounded-full ${c?.dot ?? ""}`} />
                {count}
              </span>
            );
          })}
          <span className="text-[11px] text-muted-foreground font-mono">
            行 {chunk.startLine}–{chunk.endLine}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {!collapsed && (
        <div className="border-t border-border">
          {/* Issues grouped by section type */}
          {chunk.sections.map((section) => {
            const visibleItems = section.items.filter((i) => {
              const order = SEVERITY_ORDER[i.severity] ?? 99;
              return order <= maxOrder;
            });
            if (visibleItems.length === 0) return null;
            const sectionColor = SECTION_COLORS[section.type];
            const sectionIssueCount = visibleItems.filter((i) => i.severity !== "ok").length;
            const sectionOkCount = visibleItems.filter((i) => i.severity === "ok").length;
            return (
              <div key={section.type} className="border-b border-border last:border-b-0">
                {/* Section header */}
                <div className={`flex items-center gap-3 px-4 py-2.5 ${sectionColor?.bg ?? ""}`}>
                  <SectionBadge type={section.type} />
                  <span className="text-sm font-medium text-muted-foreground">
                    {sectionIssueCount > 0 && `${sectionIssueCount} 个问题`}
                    {sectionIssueCount > 0 && sectionOkCount > 0 && " · "}
                    {sectionOkCount > 0 && `${sectionOkCount} 项已确认`}
                  </span>
                </div>
                {/* Section items */}
                <div className="divide-y divide-border">
                  {[...visibleItems].sort(severitySort).map((item, idx) => (
                    <div key={idx} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <SeverityIcon severity={item.severity} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <SeverityBadge severity={item.severity} />
                            <span className="text-xs text-muted-foreground">
                              行 {item.lineStart}–{item.lineEnd}
                            </span>
                          </div>
                          <p className="text-sm font-medium mb-0.5">{item.issue}</p>
                          <pre className="text-xs bg-muted rounded px-2 py-1 overflow-x-auto mb-1 font-mono">
                            {item.snippet}
                          </pre>
                          <p className="text-xs text-muted-foreground">建议: {item.suggestion}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────

export default function ReviewChunkList({ chunks }: ReviewChunkListProps) {
  const [minSeverity, setMinSeverity] = useState<string>("error"); // default: only errors

  // Mapping from threshold value to max allowed order (inclusive)
  // ">= error"     → order <= 0 (only error)
  // ">= warning"   → order <= 1 (error + warning)
  // ">= suggestion" → order <= 2 (error + warning + suggestion)
  // "all"          → order <= 3 (all, including ok)
  const maxOrder = SEVERITY_ORDER[minSeverity] ?? 3;

  // Only show chunks where at least one item passes the threshold
  const visibleChunks = useMemo(
    () =>
      chunks.filter((chunk) =>
        chunk.sections.some((s) =>
          s.items.some((i) => {
            const order = SEVERITY_ORDER[i.severity] ?? 99;
            return order <= maxOrder;
          }),
        ),
      ),
    [chunks, maxOrder],
  );

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{visibleChunks.length} 个段落</span>
        <FilterMenu minSeverity={minSeverity} onChange={setMinSeverity} />
      </div>

      {visibleChunks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <p className="text-sm">当前筛选条件下没有符合条件的条目</p>
        </div>
      ) : (
        /* Chunk cards */
        <div className="flex flex-col gap-4">
          {visibleChunks.map((chunk) => (
            <ChunkCard key={chunk.chunkId} chunk={chunk} maxOrder={maxOrder} />
          ))}
        </div>
      )}
    </div>
  );
}
