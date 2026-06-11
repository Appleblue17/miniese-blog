/**
 * @file AdminWikiList - Client-side wiki entry list for the admin dashboard.
 *
 * Features:
 * - Status tab bar (全部 / 申请中 / 生成中 / 待审查 / 已审查)
 * - Paginated entry list per status
 * - Approve (proposed → creating), Complete (creating → unreviewed),
 *   Review (unreviewed → reviewed), Edit, Delete actions
 */

"use client";

import { useState, useCallback } from "react";
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
} from "lucide-react";
import Link from "next/link";
import type { WikiEntryMeta, WikiStatus } from "@/types/wiki";

interface AdminWikiListProps {
  entries: WikiEntryMeta[];
  activeStatus: string;
  currentPage: number;
  totalPages: number;
}

type StatusTabDef = {
  key: string;
  label: string;
  icon: React.ReactNode;
};

const STATUS_TABS: StatusTabDef[] = [
  { key: "all", label: "全部", icon: null },
  { key: "proposed", label: "申请中", icon: <Hourglass className="size-3.5" /> },
  { key: "creating", label: "生成中", icon: <Sparkles className="size-3.5" /> },
  { key: "unreviewed", label: "待审查", icon: <Clock className="size-3.5" /> },
  { key: "reviewed", label: "已审查", icon: <ShieldCheck className="size-3.5" /> },
];

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

const STATUS_CONFIG: Record<
  WikiStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  proposed: {
    label: "申请中",
    color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icon: <Hourglass className="size-3" />,
  },
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
  onConfirm: () => void;
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
              确定要删除词条 <strong className="text-foreground">{name}</strong> 吗？<br />
              {loading ? "" : "此操作不可撤销。"}
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
            onClick={onConfirm}
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

function EntryRow({ entry }: { entry: WikiEntryMeta }) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
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
      router.refresh();
    } catch {
      setError("删除请求失败");
      setDeleting(false);
    }
  }, [entry.name, entry.language, router]);

  const handleReview = useCallback(async () => {
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
      router.refresh();
    } catch {
      setError("审查请求失败");
      setReviewing(false);
    }
  }, [entry.name, entry.language, router]);

  const handleComplete = useCallback(async () => {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/wiki/${encodeURIComponent(entry.name)}/complete?lang=${entry.language}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "标记完成失败");
        setCompleting(false);
        return;
      }
      router.refresh();
    } catch {
      setError("标记完成请求失败");
      setCompleting(false);
    }
  }, [entry.name, entry.language, router]);

  const canEdit = entry.status === "unreviewed" || entry.status === "reviewed";
  const canReview = entry.status === "unreviewed";

  return (
    <>
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{entry.name}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0.5">
              {entry.language}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {entry.aliases.length > 0 && (
              <span>别名: {entry.aliases.join(", ")}</span>
            )}
            <span>更新 {formatDate(entry.updatedAt)}</span>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <StatusBadge status={entry.status} />

          {entry.status === "creating" && (
            <button
              type="button"
              onClick={handleComplete}
              disabled={completing}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors disabled:opacity-50"
              title="标记 AI 填充完成"
            >
              {completing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              完成
            </button>
          )}

          {canReview && (
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

          {canEdit && (
            <Link
              href={`/admin/wiki/${entry.id}`}
              className="inline-flex items-center rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="编辑"
            >
              <Edit className="size-3.5" />
            </Link>
          )}

          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="inline-flex items-center rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="删除"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {showDelete && (
        <DeleteModal
          name={entry.name}
          onConfirm={handleDelete}
          onCancel={() => { setShowDelete(false); setError(null); }}
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
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
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
      {tabs.map((tab) => (
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
      ))}
    </div>
  );
}

// --- Main Component ---

export function AdminWikiList({
  entries,
  activeStatus,
  currentPage,
  totalPages,
}: AdminWikiListProps) {
  const basePath = "/admin/wiki";

  // Build base params for pagination links
  const baseParams = new URLSearchParams();
  if (activeStatus !== "all") baseParams.set("status", activeStatus);

  return (
    <div className="flex flex-col gap-4">
      <StatusTabBar
        tabs={STATUS_TABS}
        activeKey={activeStatus}
        basePath={basePath}
      />

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <p className="text-lg">暂无词条</p>
          <p className="text-sm">
            该状态暂无词条。
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        baseParams={baseParams}
      />
    </div>
  );
}
