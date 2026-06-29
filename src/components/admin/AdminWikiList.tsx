/**
 * @file AdminWikiList - Client-side wiki management list for the admin dashboard.
 *
 * Features:
 * - Status tab bar (全部 / 申请中 / 已驳回 / 生成中 / 待审查 / 已审查)
 * - "全部" / "生成中" / "待审查" / "已审查" tabs: fetches WikiEntry data
 * - "申请中" / "已驳回" tabs: fetches WikiDiscovery data
 * - WikiDiscovery cards: importance bar, term type badge, approve/reject actions
 * - WikiEntry cards: status badge, complete/review/edit/delete actions
 * - Batch operations for "申请中" tab
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Edit,
  Loader2,
  AlertTriangle,
  X,
  BookOpen,
  CheckCircle2,
  Hourglass,
  Sparkles,
  Clock,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Check,
  Star,
  Filter,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SearchFilters } from "@/components/ui/SearchFilters";
import type { WikiEntryMeta, WikiStatus } from "@/types/wiki";

/** Map language code to display label */
function langLabel(code: string): string {
  return code === "zh" ? "中文" : "EN";
}

// ---------------------------------------------------------------------------
// Props & Constants
// ---------------------------------------------------------------------------

interface AdminWikiListProps {
  activeStatus: string;
  currentPage: number;
}

const PAGE_SIZE = 20;

type StatusTabDef = {
  key: string;
  label: string;
  icon: React.ReactNode;
};

const STATUS_TABS: StatusTabDef[] = [
  { key: "all", label: "全部", icon: <BookOpen className="size-3.5" /> },
  { key: "|", label: "", icon: null },
  { key: "pending", label: "申请中", icon: <Hourglass className="size-3.5" /> },
  { key: "creating", label: "生成中", icon: <Sparkles className="size-3.5" /> },
  { key: "|", label: "", icon: null },
  { key: "unreviewed", label: "待审查", icon: <Clock className="size-3.5" /> },
  { key: "reviewed", label: "已审查", icon: <ShieldCheck className="size-3.5" /> },
  { key: "|", label: "", icon: null },
  { key: "failed", label: "生成失败", icon: <AlertCircle className="size-3.5" /> },
  { key: "rejected", label: "已删除", icon: <X className="size-3.5" /> },
];

/** Tabs that fetch WikiEntry data */
const ENTRY_TABS = new Set(["all", "creating", "unreviewed", "reviewed", "deleted"]);

/** Tabs that fetch WikiDiscovery data */
const DISCOVERY_TABS = new Set(["pending", "failed", "rejected"]);

// Discovery type for client-side use
interface DiscoveryItem {
  id: string;
  articleId: string | null;
  articleSlug: string;
  articleLang: string;
  term: string;
  type: string;
  definition: string;
  importance: number;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  wikiEntryId?: string | null;
  failedReason?: string | null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

// --- Status Badge ---

const STATUS_CONFIG: Record<WikiStatus, { label: string; color: string; icon: React.ReactNode }> = {
  creating: {
    label: "生成中",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    icon: <Sparkles className="size-3" />,
  },
  unreviewed: {
    label: "待审查",
    color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    icon: <Clock className="size-3" />,
  },
  reviewed: {
    label: "已审查",
    color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    icon: <ShieldCheck className="size-3" />,
  },
  deleted: {
    label: "已删除",
    color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    icon: <X className="size-3" />,
  },
};

function StatusBadge({ status }: { status: WikiStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${config.color}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

// --- Delete Confirmation Modal ---

function DeleteModal({
  name,
  onConfirm,
  onCancel,
  loading,
}: {
  name: string;
  onConfirm: ((e: React.MouseEvent) => void);
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative mx-4 w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-destructive/10 p-2">
            <AlertTriangle className="size-5 text-destructive" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold">确认删除词条</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              确定要将词条 <strong className="text-foreground">{name}</strong> 移至已删除吗？
              <br />
              {loading ? "" : "词条不会从知识库中永久移除。"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={(e) => onConfirm(e)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "删除中..." : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Entry Row ---

function EntryRow({ entry, onRefresh }: { entry: WikiEntryMeta; onRefresh: () => void }) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      e?.preventDefault();
      setDeleting(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/wiki/${encodeURIComponent(entry.name)}?lang=${entry.language}`,
          { method: "DELETE" },
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "删除失败");
          setDeleting(false);
          return;
        }
        setShowDelete(false);
        onRefresh();
      } catch {
        setError("删除请求失败");
        setDeleting(false);
      }
    },
    [entry.name, entry.language, onRefresh],
  );

  const handleReview = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setReviewing(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/wiki/${encodeURIComponent(entry.name)}/review?lang=${entry.language}`,
          { method: "POST" },
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "审查失败");
          setReviewing(false);
          return;
        }
        onRefresh();
      } catch {
        setError("审查请求失败");
        setReviewing(false);
      }
    },
    [entry.name, entry.language, onRefresh],
  );

  const handleUndo = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setUndoing(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/wiki/${encodeURIComponent(entry.name)}/undo?lang=${entry.language}`,
          { method: "POST" },
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "撤销失败");
          setUndoing(false);
          return;
        }
        onRefresh();
      } catch {
        setError("撤销请求失败");
        setUndoing(false);
      }
    },
    [entry.name, entry.language, onRefresh],
  );

  const canEdit = entry.status === "unreviewed" || entry.status === "reviewed";
  const canReview = entry.status === "unreviewed";
  const canDelete = entry.status !== "deleted";

  return (
    <>
      <Link
        href={`/${entry.language}/wiki/${encodeURIComponent(entry.name)}`}
        target="_blank"
        className={`card-base flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted ${
          entry.status === "deleted"
            ? "border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20"
            : "border-border bg-card"
        }`}
      >
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{entry.name}</span>
            {entry.type && <TypeBadge type={entry.type} />}
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider px-1.5 py-0.5">
              {langLabel(entry.language)}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {entry.aliases.length > 0 && <span>别名: {entry.aliases.join(", ")}</span>}
            <span>更新 {formatDate(entry.updatedAt)}</span>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={entry.status} />

          {entry.status === "unreviewed" && (
            <button
              type="button"
              onClick={handleReview}
              disabled={reviewing}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-green-600 hover:bg-green-50 dark:hover:bg-green-950 transition-colors disabled:opacity-50"
              title="审查通过"
            >
              {reviewing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              通过
            </button>
          )}

          {(entry.status === "unreviewed" || entry.status === "creating") && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoing}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors disabled:opacity-50"
              title={entry.status === "creating" ? "撤销（移至申请中）" : "撤销（移至申请中）"}
            >
              {undoing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              撤销
            </button>
          )}

          {entry.status === "reviewed" && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoing}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors disabled:opacity-50"
              title="撤销审查（移至待审查）"
            >
              {undoing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              撤销审查
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                window.open(`/admin/wiki/${entry.id}`, "_self");
              }}
              className="inline-flex items-center rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              title="编辑"
            >
              <Edit className="size-3.5" />
              <span className="ml-1 hidden sm:inline">编辑</span>
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowDelete(true);
              }}
              className="inline-flex items-center rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="移至已删除"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </Link>

      {showDelete && (
        <DeleteModal
          name={entry.name}
          onConfirm={(e) => handleDelete(e)}
          onCancel={() => {
            setShowDelete(false);
            setError(null);
          }}
          loading={deleting}
        />
      )}
    </>
  );
}

// --- Pagination ---

function Pagination({
  currentPage,
  totalPages,
  baseParams,
}: {
  currentPage: number;
  totalPages: number;
  baseParams: URLSearchParams;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  const pageHref = (page: number) => {
    const p = new URLSearchParams(baseParams);
    p.set("page", String(page));
    return `/admin/wiki?${p.toString()}`;
  };

  return (
    <nav className="flex items-center justify-center gap-1 mt-6" aria-label="分页">
      <Link
        href={currentPage > 1 ? pageHref(currentPage - 1) : "#"}
        className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm ${
          currentPage <= 1
            ? "text-muted-foreground/40 pointer-events-none"
            : "text-muted-foreground hover:bg-accent"
        }`}
      >
        <ChevronLeft className="size-4" />
      </Link>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-muted-foreground/60">
            ...
          </span>
        ) : (
          <Link
            key={p}
            href={pageHref(p)}
            className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium ${
              p === currentPage
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {p}
          </Link>
        ),
      )}
      <Link
        href={currentPage < totalPages ? pageHref(currentPage + 1) : "#"}
        className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm ${
          currentPage >= totalPages
            ? "text-muted-foreground/40 pointer-events-none"
            : "text-muted-foreground hover:bg-accent"
        }`}
      >
        <ChevronRight className="size-4" />
      </Link>
    </nav>
  );
}

// --- Status Tab Bar ---

function StatusTabBar({
  tabs,
  activeKey,
  basePath,
}: {
  tabs: StatusTabDef[];
  activeKey: string;
  basePath: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-muted p-1" role="tablist">
      {tabs.map((tab, idx) => {
        if (tab.key === "|") {
          return (
            <span
              key={`sep-${idx}`}
              className="mx-1 h-5 w-px bg-border shrink-0"
              aria-hidden="true"
            />
          );
        }
        return (
          <Link
            key={tab.key}
            href={tab.key === "all" ? basePath : `/admin/wiki?status=${tab.key}&page=1`}
            role="tab"
            aria-selected={tab.key === activeKey}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab.key === activeKey
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

// --- Circular Importance indicator (Issue 5) ---

function CircularImportance({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const circumference = 2 * Math.PI * 14; // r=14
  const offset = circumference - (pct / 100) * circumference;
  const colorClasses =
    pct >= 90
      ? "stroke-green-500"
      : pct >= 70
        ? "stroke-blue-500"
        : pct >= 50
          ? "stroke-yellow-500"
          : "stroke-slate-400";

  return (
    <div className="relative size-9 shrink-0">
      <svg className="size-9 -rotate-90" viewBox="0 0 32 32">
        {/* Background circle */}
        <circle
          cx="16"
          cy="16"
          r="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-slate-200 dark:text-slate-700"
        />
        {/* Progress arc */}
        <circle
          cx="16"
          cy="16"
          r="14"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${colorClasses} transition-all duration-300`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-medium text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; color: string }> = {
    acronym: {
      label: "缩写",
      color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    },
    concept: {
      label: "概念",
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    },
    theorem: {
      label: "定理",
      color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    },
    tech: {
      label: "技术",
      color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
    },
    other: {
      label: "其他",
      color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    },
  };

  const c = config[type] ?? {
    label: type,
    color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${c.color}`}
    >
      {c.label}
    </span>
  );
}

function DiscoveryCard({
  discovery,
  onApprove,
  onReject,
  onUndoReject,
  onRetry,
  onUndoGenerated,
  processing,
}: {
  discovery: DiscoveryItem;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onUndoReject: (id: string) => Promise<void>;
  onRetry: (id: string) => Promise<void>;
  onUndoGenerated: (id: string) => Promise<void>;
  processing: boolean;
}) {
  return (
    <div className="card-base rounded-lg border border-border bg-card px-4 py-3 hover:border-muted-foreground/30 hover:bg-accent/30 transition-colors duration-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Term name + badges */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm">{discovery.term}</span>
            <TypeBadge type={discovery.type} />
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider px-1.5 py-0.5">
              {langLabel(discovery.articleLang)}
            </Badge>
            {discovery.status === "generated" && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                <CheckCircle2 className="size-3" />
                已生成
              </span>
            )}
            {discovery.status === "failed" && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                <AlertCircle className="size-3" />
                生成失败
              </span>
            )}
          </div>

          {/* Definition */}
          {discovery.definition && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
              {discovery.definition}
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {discovery.articleSlug && (
              <span>
                来自:{" "}
                <Link
                  href={`/${discovery.articleLang}/articles/${discovery.articleSlug}`}
                  className="underline hover:text-foreground"
                  target="_blank"
                >
                  {discovery.articleSlug}
                </Link>
              </span>
            )}
            {!discovery.articleSlug && <span>手动添加</span>}
            <span>{formatDate(discovery.createdAt)}</span>
            {discovery.status !== "pending" && discovery.approvedAt && (
              <span>
                {discovery.status === "approved" ? "已同意" : "已删除"}
                {" · "}
                {formatDate(discovery.approvedAt)}
              </span>
            )}
            {/* Link to generated wiki entry */}
            {discovery.status === "generated" && discovery.wikiEntryId && (
              <Link
                href={`/admin/wiki/${discovery.wikiEntryId}`}
                className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 underline hover:text-green-700"
              >
                <ExternalLink className="size-3" />
                查看词条
              </Link>
            )}
            {discovery.status === "failed" && discovery.failedReason && (
              <span className="text-red-500" title={discovery.failedReason}>
                原因:{" "}
                {discovery.failedReason.length > 30
                  ? discovery.failedReason.slice(0, 30) + "..."
                  : discovery.failedReason}
              </span>
            )}
          </div>
        </div>

        {/* Right side: importance + actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Circular importance indicator */}
          <CircularImportance value={discovery.importance} />

          {/* Action buttons for pending items */}
          {discovery.status === "pending" && (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => onApprove(discovery.id)}
                disabled={processing}
                className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors disabled:opacity-50 cursor-pointer"
                title="同意"
              >
                <Check className="size-3.5" />
              </button>
              <button
                onClick={() => onReject(discovery.id)}
                disabled={processing}
                className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50 cursor-pointer"
                title="删除"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* Undo reject button for rejected/deleted items */}
          {discovery.status === "rejected" && (
            <button
              onClick={() => onUndoReject(discovery.id)}
              disabled={processing}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50 cursor-pointer"
              title="撤销删除"
            >
              <RefreshCw className={`size-3 ${processing ? "animate-spin" : ""}`} />
              撤销删除
            </button>
          )}

          {/* Retry and undo buttons for failed items */}
          {discovery.status === "failed" && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onUndoGenerated(discovery.id)}
                disabled={processing}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50 cursor-pointer"
                title="撤销（回到申请中）"
              >
                <RefreshCw className={`size-3 ${processing ? "animate-spin" : ""}`} />
                撤销
              </button>
              <button
                onClick={() => onRetry(discovery.id)}
                disabled={processing}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors disabled:opacity-50 cursor-pointer"
                title="重新生成"
              >
                <RefreshCw className={`size-3 ${processing ? "animate-spin" : ""}`} />
                重试
              </button>
            </div>
          )}

          {/* Undo generated button */}
          {discovery.status === "generated" && (
            <button
              onClick={() => onUndoGenerated(discovery.id)}
              disabled={processing}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50 cursor-pointer"
              title="撤销（回到申请中）"
            >
              <RefreshCw className={`size-3 ${processing ? "animate-spin" : ""}`} />
              撤销
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main Component ---

export function AdminWikiList({ activeStatus, currentPage }: AdminWikiListProps) {
  const basePath = "/admin/wiki";

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  // WikiEntry data
  const [entries, setEntries] = useState<WikiEntryMeta[]>([]);
  const [entryTotal, setEntryTotal] = useState(0);
  const [entryTotalPages, setEntryTotalPages] = useState(1);

  // WikiDiscovery data
  const [discoveries, setDiscoveries] = useState<DiscoveryItem[]>([]);
  const [discoveryTotal, setDiscoveryTotal] = useState(0);
  const [discoveryTotalPages, setDiscoveryTotalPages] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & filter
  const [searchQ, setSearchQ] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagExclude, setTagExclude] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Batch operation
  const [processing, setProcessing] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [customCount, setCustomCount] = useState(5);
  const [customThreshold, setCustomThreshold] = useState(0.7);
  const [batchConfirm, setBatchConfirm] = useState<{ action: string; label: string } | null>(null);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchEntries = useCallback(async () => {
    if (!ENTRY_TABS.has(activeStatus)) return;

    setLoading(true);
    setError(null);
    try {
      const statuses =
        activeStatus === "all" ? ["unreviewed", "reviewed", "deleted"] : [activeStatus];

      const results: WikiEntryMeta[] = [];
      let total = 0;

      for (const status of statuses) {
        for (const lang of ["zh", "en"] as const) {
          const params = new URLSearchParams({
            lang,
            page: String(currentPage),
            limit: String(PAGE_SIZE),
            status,
          });
          if (searchQ) params.set("q", searchQ);
          if (tagFilter.length > 0) params.set("tagFilter", tagFilter.join(","));
          if (tagExclude.length > 0) params.set("tagExclude", tagExclude.join(","));

          const res = await fetch(`/api/wiki?${params}`, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            results.push(...data.entries);
            total += data.total;
          }
        }
      }

      setEntries(results);
      setEntryTotal(total);
      setEntryTotalPages(activeStatus === "all" ? 1 : Math.ceil(total / (PAGE_SIZE * 2)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch entries");
    } finally {
      setLoading(false);
    }
  }, [activeStatus, currentPage, searchQ, tagFilter, tagExclude]);

  const fetchDiscoveries = useCallback(async () => {
    if (!DISCOVERY_TABS.has(activeStatus)) return;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(PAGE_SIZE),
        status: activeStatus,
      });

      const res = await fetch(`/api/admin/discoveries?${params}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setDiscoveries(data.discoveries ?? []);
        setDiscoveryTotal(data.total ?? 0);
        setDiscoveryTotalPages(data.totalPages ?? 1);
      } else {
        throw new Error("Failed to fetch discoveries");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch discoveries");
    } finally {
      setLoading(false);
    }
  }, [activeStatus, currentPage]);

  // Fetch available tags for entry tabs
  useEffect(() => {
    if (ENTRY_TABS.has(activeStatus)) {
      fetch("/api/tags?type=wiki")
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.tags) setAllTags(data.tags);
        })
        .catch(() => {});
    }
  }, [activeStatus]);

  useEffect(() => {
    if (ENTRY_TABS.has(activeStatus)) {
      fetchEntries();
    } else if (DISCOVERY_TABS.has(activeStatus)) {
      fetchDiscoveries();
    }
  }, [activeStatus, currentPage, fetchEntries, fetchDiscoveries]);

  // -----------------------------------------------------------------------
  // Batch operations for pending discoveries
  // -----------------------------------------------------------------------

  async function batchOperation(params: Record<string, unknown>) {
    setProcessing(true);
    try {
      const res = await fetch("/api/admin/discoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error("Operation failed");
      await fetchDiscoveries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setProcessing(false);
    }
  }

  function approveAll() {
    setBatchConfirm({ action: "approve", label: "同意全部" });
  }

  function approveHighImportance() {
    setBatchConfirm({ action: "approve_high", label: "高重要性" });
  }

  function approveTopN(n: number) {
    setBatchConfirm({ action: "approve_top", label: `前${n}个` });
  }

  function rejectBatch() {
    setBatchConfirm({ action: "reject", label: "驳回" });
  }

  function confirmBatch() {
    if (!batchConfirm) return;
    switch (batchConfirm.action) {
      case "approve":
        batchOperation({ action: "approve" });
        break;
      case "approve_high":
        batchOperation({ action: "approve", minImportance: 0.7, limit: 9999 });
        break;
      case "approve_top":
        batchOperation({ action: "approve", limit: 5 });
        break;
      case "reject":
        batchOperation({ action: "reject" });
        break;
    }
    setBatchConfirm(null);
  }

  function approveCustom() {
    if (customCount > 0) {
      batchOperation({ action: "approve", limit: customCount });
    }
    setShowCustomDialog(false);
  }

  function approveByThreshold() {
    batchOperation({
      action: "approve",
      minImportance: customThreshold,
      limit: 9999,
    });
    setShowCustomDialog(false);
  }

  // -----------------------------------------------------------------------
  // Single discovery operations
  // -----------------------------------------------------------------------

  async function approveDiscovery(id: string) {
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/discoveries/${id}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `操作失败 (${res.status})`);
      }
      await fetchDiscoveries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setProcessing(false);
    }
  }

  async function rejectDiscovery(id: string) {
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/discoveries/${id}/reject`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Reject failed");
      await fetchDiscoveries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setProcessing(false);
    }
  }

  async function undoRejectDiscovery(id: string) {
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/discoveries/${id}/undo-reject`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Undo reject failed");
      await fetchDiscoveries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Undo reject failed");
    } finally {
      setProcessing(false);
    }
  }

  async function retryDiscovery(id: string) {
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/discoveries/${id}/retry`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "重新生成失败");
      }
      await fetchDiscoveries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重新生成失败");
    } finally {
      setProcessing(false);
    }
  }

  async function undoGeneratedDiscovery(id: string) {
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/discoveries/${id}/undo`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "撤销失败");
      }
      await fetchDiscoveries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "撤销失败");
    } finally {
      setProcessing(false);
    }
  }

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  const isEntryTab = ENTRY_TABS.has(activeStatus);
  const isDiscoveryTab = DISCOVERY_TABS.has(activeStatus);
  const isEmpty = isEntryTab ? entries.length === 0 : discoveries.length === 0;
  const listTotal = isEntryTab ? entryTotal : discoveryTotal;
  const listTotalPages = isEntryTab ? entryTotalPages : discoveryTotalPages;

  // Build base params for pagination links
  const baseParams = new URLSearchParams();
  if (activeStatus !== "all") baseParams.set("status", activeStatus);

  return (
    <div className="flex flex-col gap-4">
      <StatusTabBar tabs={STATUS_TABS} activeKey={activeStatus} basePath={basePath} />

      {/* Search & Filters (entry tabs only) */}
      {isEntryTab && (
        <SearchFilters
          q={searchQ}
          tagFilter={tagFilter}
          tagExclude={tagExclude}
          allTags={allTags}
          onSearch={(q) => {
            setSearchQ(q);
            const p = new URLSearchParams();
            p.set("status", activeStatus);
            p.set("page", "1");
            if (q) p.set("q", q);
            if (tagFilter.length > 0) p.set("tagFilter", tagFilter.join(","));
            if (tagExclude.length > 0) p.set("tagExclude", tagExclude.join(","));
            window.history.replaceState(null, "", `/admin/wiki?${p.toString()}`);
          }}
          onTagFilter={(tags) => {
            setTagFilter(tags);
            const p = new URLSearchParams();
            p.set("status", activeStatus);
            p.set("page", "1");
            if (searchQ) p.set("q", searchQ);
            if (tags.length > 0) p.set("tagFilter", tags.join(","));
            if (tagExclude.length > 0) p.set("tagExclude", tagExclude.join(","));
            window.history.replaceState(null, "", `/admin/wiki?${p.toString()}`);
          }}
          onTagExclude={(tags) => {
            setTagExclude(tags);
            const p = new URLSearchParams();
            p.set("status", activeStatus);
            p.set("page", "1");
            if (searchQ) p.set("q", searchQ);
            if (tagFilter.length > 0) p.set("tagFilter", tagFilter.join(","));
            if (tags.length > 0) p.set("tagExclude", tags.join(","));
            window.history.replaceState(null, "", `/admin/wiki?${p.toString()}`);
          }}
          lang="zh"
        />
      )}

      {/* Batch operation toolbar (pending discoveries only) */}
      {activeStatus === "pending" && discoveries.length > 0 && !loading && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
          <span className="text-xs font-medium text-muted-foreground mr-2">批量操作:</span>
          <button
            onClick={approveAll}
            disabled={processing}
            className="inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 hover:border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 border border-transparent transition-all disabled:opacity-50 cursor-pointer"
          >
            <Check className="size-3 mr-1" />
            同意全部
          </button>
          <button
            onClick={approveHighImportance}
            disabled={processing}
            className="inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 hover:border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 border border-transparent transition-all disabled:opacity-50 cursor-pointer"
          >
            <Star className="size-3 mr-1" />
            高重要性
          </button>
          <button
            onClick={() => approveTopN(5)}
            disabled={processing}
            className="inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium bg-cyan-100 text-cyan-700 hover:bg-cyan-200 hover:border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-400 dark:hover:bg-cyan-900/50 border border-transparent transition-all disabled:opacity-50 cursor-pointer"
          >
            <Filter className="size-3 mr-1" />
            前5个
          </button>
          <button
            onClick={() => setShowCustomDialog(true)}
            disabled={processing}
            className="inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 hover:border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 border border-transparent transition-all disabled:opacity-50 cursor-pointer"
          >
            <Filter className="size-3 mr-1" />
            自定义
          </button>
          <span className="text-muted-foreground/40 mx-1">|</span>
          <button
            onClick={rejectBatch}
            disabled={processing}
            className="inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 hover:border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 border border-transparent transition-all disabled:opacity-50 cursor-pointer"
          >
            <X className="size-3 mr-1" />
            驳回
          </button>
        </div>
      )}

      {/* Custom dialog */}
      {showCustomDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-4">自定义批量操作</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  按数量同意
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={customCount}
                    onChange={(e) => setCustomCount(parseInt(e.target.value, 10) || 1)}
                    className="w-20 rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">个最高重要性词条</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">或</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  按阈值同意
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={customThreshold}
                    onChange={(e) => setCustomThreshold(parseFloat(e.target.value) || 0.7)}
                    className="w-20 rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">及以上重要性</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCustomDialog(false)}
                className="rounded-md px-3 py-1.5 text-sm border border-border hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={approveCustom}
                className="rounded-md px-3 py-1.5 text-sm bg-primary text-primary-foreground hover:opacity-90"
              >
                同意（按数量）
              </button>
              <button
                onClick={approveByThreshold}
                className="rounded-md px-3 py-1.5 text-sm bg-primary text-primary-foreground hover:opacity-90"
              >
                同意（按阈值）
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch confirmation dialog */}
      {batchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBatchConfirm(null)} />
          <div className="relative mx-4 w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-primary/10 p-2">
                <AlertTriangle className="size-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold">确认批量操作</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  确定要执行 <strong className="text-foreground">{batchConfirm.label}</strong>{" "}
                  操作吗？
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  此操作将直接修改 {discoveries.length} 条候选词条记录。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBatchConfirm(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setBatchConfirm(null)}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmBatch}
                disabled={processing}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {processing && <Loader2 className="size-4 animate-spin" />}
                {processing ? "执行中..." : "确认执行"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            关闭
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCw className="size-6 animate-spin mr-2" />
          加载中...
        </div>
      )}

      {/* Empty state */}
      {!loading && isEmpty && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <p className="text-lg">
            {activeStatus === "pending"
              ? "暂无待审批的词条"
              : activeStatus === "failed"
                ? "暂无生成失败的词条"
                : activeStatus === "rejected"
                  ? "暂无已删除的词条"
                  : "暂无词条"}
          </p>
          <p className="text-sm">
            {activeStatus === "pending"
              ? "新建词条或发布文章后，AI 会自动推荐术语。"
              : "该状态下暂无内容。"}
          </p>
        </div>
      )}

      {/* List */}
      {!loading && !isEmpty && (
        <div className="flex flex-col gap-1">
          {isEntryTab &&
            entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onRefresh={fetchEntries} />
            ))}
          {isDiscoveryTab &&
            discoveries.map((d) => (
              <DiscoveryCard
                key={d.id}
                discovery={d}
                onApprove={approveDiscovery}
                onReject={rejectDiscovery}
                onUndoReject={undoRejectDiscovery}
                onRetry={retryDiscovery}
                onUndoGenerated={undoGeneratedDiscovery}
                processing={processing}
              />
            ))}
        </div>
      )}

      {/* Pagination */}
      {listTotalPages > 1 && !loading && (
        <Pagination currentPage={currentPage} totalPages={listTotalPages} baseParams={baseParams} />
      )}
    </div>
  );
}
