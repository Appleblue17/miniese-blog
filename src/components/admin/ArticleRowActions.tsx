/**
 * @file ArticleRowActions - Client-side interactive components for article list rows.
 *
 * Provides:
 * - Delete button with confirmation dialog for published articles and drafts
 * - Edit draft button for published articles without an existing draft
 */

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Edit,
  Eye,
  FileText,
  Loader2,
  AlertTriangle,
  X,
} from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "./StatusBadge";

// --- Types ---

interface ArticleItem {
  id: string;
  slug: string;
  title: string;
  language: string;
  status: string;
  contentPath: string;
  summary: string | null;
  tags: string[];
  author: string;
  publishedAt: string | null;
  updatedAt: string;
  changelog: string | null;
  viewCount: number;
  charCount: number;
  lineCount: number;
}

interface DraftItem {
  id: string;
  slug: string;
  title: string;
  language: string;
  status: string;
  contentPath: string;
  updatedAt: string;
  draftOfId: string | null;
  charCount: number;
  lineCount: number;
}

interface ArticleRowActionsProps {
  articles: ArticleItem[];
  drafts: DraftItem[];
  newDrafts: DraftItem[];
}

// --- Helpers ---

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ArticleMetaRow({
  language,
  publishedAt,
  updatedAt,
  viewCount,
  charCount,
  lineCount,
}: {
  language: string;
  publishedAt?: string | null;
  updatedAt: string;
  viewCount?: number;
  charCount: number;
  lineCount: number;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
      <span>{language === "zh" ? "中文" : "English"}</span>
      {publishedAt != null && <span>发布 {formatDate(publishedAt)}</span>}
      <span>修改 {formatDateTime(updatedAt)}</span>
      {viewCount != null && <span>阅读 {viewCount}</span>}
      <span>{lineCount} 行</span>
      <span>{charCount} 字符</span>
    </div>
  );
}

// --- Delete Confirmation Modal ---

function DeleteModal({
  title,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
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
            <h3 className="text-base font-semibold">确认删除</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              确定要删除 <strong className="text-foreground">{title}</strong> 吗？
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

// --- Published Article Row ---

function PublishedArticleRow({
  article,
  hasDraft,
}: {
  article: ArticleItem;
  hasDraft: boolean;
}) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/articles/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: article.id }),
      });
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
  }, [article.id, router]);

  const handleCreateDraft = useCallback(async () => {
    setCreatingDraft(true);
    setError(null);
    try {
      const res = await fetch("/api/articles/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: article.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "创建草稿失败");
        setCreatingDraft(false);
        return;
      }
      // Navigate to the new draft
      router.push(data.draft.url);
    } catch {
      setError("创建草稿请求失败");
      setCreatingDraft(false);
    }
  }, [article.id, router]);

  return (
    <>
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{article.title}</span>
            <StatusBadge status={article.status} />
          </div>
          <ArticleMetaRow
            language={article.language}
            publishedAt={article.publishedAt}
            updatedAt={article.updatedAt}
            viewCount={article.viewCount}
            charCount={article.charCount}
            lineCount={article.lineCount}
          />
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-4">
          {/* Create/edit draft button */}
          {!hasDraft ? (
            <button
              type="button"
              onClick={handleCreateDraft}
              disabled={creatingDraft}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              title="创建草稿"
            >
              {creatingDraft ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Edit className="size-3.5" />
              )}
              <span className="hidden sm:inline">编辑</span>
            </button>
          ) : (
            <span className="text-xs text-muted-foreground px-1">草稿中</span>
          )}

          {/* View link */}
          <Link
            href={`/${article.language}/articles/${article.slug}`}
            className="inline-flex items-center rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            target="_blank"
            title="查看"
          >
            <Eye className="size-3.5" />
          </Link>

          {/* Delete button */}
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
          title={article.title}
          onConfirm={handleDelete}
          onCancel={() => { setShowDelete(false); setError(null); }}
          loading={deleting}
        />
      )}
    </>
  );
}

// --- Draft Row (linked to published) ---

function LinkedDraftRow({ draft }: { draft: DraftItem }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-dashed border-yellow-300 dark:border-yellow-700 bg-card/50 px-4 py-2.5 ml-6 border-l-2 border-l-yellow-400">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <FileText className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm truncate">{draft.title}</span>
          <StatusBadge status={draft.status} />
        </div>
        <ArticleMetaRow
          language={draft.language}
          updatedAt={draft.updatedAt}
          charCount={draft.charCount}
          lineCount={draft.lineCount}
        />
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-4">
        <Link
          href={`/admin/articles/${draft.id}/edit`}
          className="text-xs text-primary hover:underline"
        >
          编辑草稿
        </Link>
        <DeleteDraftButton draft={draft} />
      </div>
    </div>
  );
}

// --- Delete Draft Button ---

function DeleteDraftButton({ draft }: { draft: DraftItem }) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/articles/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id }),
      });
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
  }, [draft.id, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDelete(true)}
        className="inline-flex items-center rounded-md p-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        title="删除草稿"
      >
        <Trash2 className="size-3.5" />
      </button>
      {showDelete && (
        <DeleteModal
          title={draft.title}
          onConfirm={handleDelete}
          onCancel={() => { setShowDelete(false); setError(null); }}
          loading={deleting}
        />
      )}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </>
  );
}

// --- New Draft Row (no linked article) ---

function NewDraftRow({ draft }: { draft: DraftItem }) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/articles/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id }),
      });
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
  }, [draft.id, router]);

  return (
    <div className="flex flex-col gap-1">
      {/* Placeholder article row */}
      <div className="flex items-center justify-between rounded-lg border border-dashed border-border bg-card/30 px-4 py-3 opacity-70">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">新文章</span>
            <StatusBadge status="draft" />
          </div>
          <div className="text-xs text-muted-foreground">暂无已发布版本</div>
        </div>
      </div>

      {/* Draft row (below placeholder) */}
      <div className="flex items-center justify-between rounded-lg border border-dashed border-yellow-300 dark:border-yellow-700 bg-card px-4 py-3 ml-6 border-l-2 border-l-yellow-400">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileText className="size-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate">{draft.title}</span>
            <StatusBadge status={draft.status} />
          </div>
          <ArticleMetaRow
            language={draft.language}
            updatedAt={draft.updatedAt}
            charCount={draft.charCount}
            lineCount={draft.lineCount}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-4">
          <Link
            href={`/admin/articles/${draft.id}/edit`}
            className="text-xs text-primary hover:underline"
          >
            编辑
          </Link>
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="inline-flex items-center rounded-md p-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="删除草稿"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {showDelete && (
        <DeleteModal
          title={draft.title}
          onConfirm={handleDelete}
          onCancel={() => { setShowDelete(false); setError(null); }}
          loading={deleting}
        />
      )}
    </div>
  );
}

// --- Main Component ---

export function ArticleRowActions({
  articles,
  drafts,
  newDrafts,
}: ArticleRowActionsProps) {
  return (
    <>
      {articles.map((article) => {
        const linkedDraft = drafts.find(
          (d) => d.draftOfId === article.id,
        );

        return (
          <div key={article.id} className="flex flex-col gap-1">
            <PublishedArticleRow
              article={article}
              hasDraft={!!linkedDraft}
            />
            {linkedDraft && <LinkedDraftRow draft={linkedDraft} />}
          </div>
        );
      })}

      {newDrafts.map((draft) => (
        <NewDraftRow key={draft.id} draft={draft} />
      ))}
    </>
  );
}
