/**
 * @file ArticleRowActions - Client-side interactive components for article list rows.
 *
 * Provides:
 * - Delete button with confirmation dialog for published articles and drafts
 * - Edit draft button for published articles without an existing draft
 *
 * Each row is wrapped in a clickable Link (clicking the card body navigates).
 * Action buttons use e.stopPropagation() to prevent triggering the row link.
 */

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Edit,
  FileText,
  Loader2,
  AlertTriangle,
  X,
  RefreshCw,
  Languages,
  Sparkles,
  Globe,
  EyeOff,
  Pin,
  Link2,
  ChevronDown,
  Circle,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
  isHidden?: boolean;
  isPinned?: boolean;
  linkSyncStale?: boolean | null;
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

interface TranslationItem {
  id: string;
  slug: string;
  title: string;
  language: string;
  status: string;
  contentPath: string;
  updatedAt: string;
  originalId: string | null;
  isAITranslated: boolean;
  charCount: number;
  lineCount: number;
}

interface ArticleRowActionsProps {
  articles: ArticleItem[];
  translations: TranslationItem[];
  drafts: DraftItem[];
  newDrafts: DraftItem[];
  pendingTasks: Record<string, string[]>;
}

/** Map language code to display label */
function langLabel(code: string): string {
  return code === "zh" ? "中文" : "EN";
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
    hourCycle: "h23",
  });
}

/**
 * Format a timestamp as a human-readable "time ago" string.
 */
function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  return formatDate(dateStr);
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
      <Badge variant="outline" className="text-[10px] uppercase tracking-wider px-1.5 py-0.5">
        {langLabel(language)}
      </Badge>
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
  itemType,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  itemType: "文章" | "草稿";
  onConfirm: (e: React.MouseEvent) => void;
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
            <h3 className="text-base font-semibold">确认删除{itemType}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              确定要删除{itemType} <strong className="text-foreground">{title}</strong> 吗？
              <br />
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

// --- Published Article Row ---

function PublishedArticleRow({
  article,
  hasDraft,
  activeTaskTypes = [],
}: {
  article: ArticleItem;
  hasDraft: boolean;
  activeTaskTypes?: string[];
}) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [refreshingLinks, setRefreshingLinks] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [togglingHidden, setTogglingHidden] = useState(false);
  const [togglingPinned, setTogglingPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLinkMenu, setShowLinkMenu] = useState(false);
  const [linkStatus, setLinkStatus] = useState<{
    linkCount: number;
    lastDetectedAt: string | null;
    isStale: boolean;
  } | null>(null);
  const [loadingLinkStatus, setLoadingLinkStatus] = useState(false);

  const hasPendingTranslate = activeTaskTypes.includes("translate");
  const hasPendingDiscover = activeTaskTypes.includes("discover");

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
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
    },
    [article.id, router],
  );

  const handleCreateDraft = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
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
        router.push(data.draft.url);
      } catch {
        setError("创建草稿请求失败");
        setCreatingDraft(false);
      }
    },
    [article.id, router],
  );

  const handleRefreshLinks = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setRefreshingLinks(true);
      setError(null);
      try {
        const res = await fetch("/api/articles/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleId: article.id,
            lang: article.language,
            preserveUpdatedAt: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "刷新链接失败");
          setRefreshingLinks(false);
          return;
        }
        setRefreshingLinks(false);
        router.refresh();
      } catch {
        setError("刷新链接请求失败");
        setRefreshingLinks(false);
      }
    },
    [article.id, article.language, router],
  );

  const handleTranslate = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setTranslating(true);
      setError(null);
      try {
        const res = await fetch("/api/ai/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleId: article.id,
            sourceLanguage: article.language,
            targetLanguage: article.language === "zh" ? "en" : "zh",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "翻译任务提交失败");
          setTranslating(false);
          return;
        }
        setTranslating(false);
        router.push(`/admin/ai-tasks/${data.taskId}`);
      } catch {
        setError("翻译请求失败");
        setTranslating(false);
      }
    },
    [article.id, article.language, router],
  );

  const handleDiscover = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setDiscovering(true);
      setError(null);
      try {
        const res = await fetch("/api/ai/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId: article.id }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "词条发现任务提交失败");
          setDiscovering(false);
          return;
        }
        setDiscovering(false);
        router.push(`/admin/ai-tasks/${data.taskId}`);
      } catch {
        setError("词条发现请求失败");
        setDiscovering(false);
      }
    },
    [article.id, router],
  );

  const handleToggleHidden = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setTogglingHidden(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/articles/${article.slug}/toggle-hidden?lang=${article.language}`,
          { method: "POST" },
        );
        if (!res.ok) {
          setError("切换隐藏状态失败");
          setTogglingHidden(false);
          return;
        }
        setTogglingHidden(false);
        router.refresh();
      } catch {
        setError("切换隐藏状态请求失败");
        setTogglingHidden(false);
      }
    },
    [article.slug, article.language, router],
  );

  const handleTogglePinned = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setTogglingPinned(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/articles/${article.slug}/toggle-pinned?lang=${article.language}`,
          { method: "POST" },
        );
        if (!res.ok) {
          setError("切换置顶状态失败");
          setTogglingPinned(false);
          return;
        }
        setTogglingPinned(false);
        router.refresh();
      } catch {
        setError("切换置顶状态请求失败");
        setTogglingPinned(false);
      }
    },
    [article.slug, article.language, router],
  );

  // Fetch link status when hover/dropdown is opened
  const handleFetchLinkStatus = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setLoadingLinkStatus(true);
      try {
        const res = await fetch(
          `/api/admin/articles/link-status?articleIds=${article.id}`,
        );
        if (res.ok) {
          const data = await res.json();
          const status = data.articles?.[0];
          if (status) {
            setLinkStatus({
              linkCount: status.linkCount,
              lastDetectedAt: status.lastDetectedAt,
              isStale: status.isStale,
            });
          }
        }
      } catch {
        // Ignore errors in link status fetch
      } finally {
        setLoadingLinkStatus(false);
      }
    },
    [article.id],
  );

  return (
    <>
      <Link
        href={`/${article.language}/articles/${article.slug}`}
        className="card-base flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted"
        target="_blank"
      >
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{article.title}</span>
            <StatusBadge status={article.status} />
            {/* Link sync status indicator */}
            {article.linkSyncStale === true && (
              <Circle className="size-2 fill-amber-500 text-amber-500 shrink-0" aria-label="链接需要更新" />
            )}
            {article.linkSyncStale === false && (
              <Circle className="size-2 fill-green-500 text-green-500 shrink-0" aria-label="链接已同步" />
            )}
            {article.isHidden && (
              <EyeOff className="size-3.5 text-muted-foreground/60" aria-label="已隐藏" />
            )}
            {article.isPinned && (
              <Pin className="size-3.5 text-amber-500" aria-label="已置顶" />
            )}
          </div>
          <ArticleMetaRow
            language={article.language}
            publishedAt={article.publishedAt}
            updatedAt={article.updatedAt}
            viewCount={article.viewCount}
            charCount={article.charCount}
            lineCount={article.lineCount}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex items-center gap-0.5 shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
          {/* Create/edit draft button */}
          {!hasDraft ? (
            <button
              type="button"
              onClick={handleCreateDraft}
              disabled={creatingDraft}
              className="inline-flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10px] leading-tight text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
              title="创建草稿"
            >
              {creatingDraft ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Edit className="size-3.5" />
              )}
              <span>编辑</span>
            </button>
          ) : null}

          {/* Link dropdown — shows wiki link status and actions */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                handleFetchLinkStatus(e);
                setShowLinkMenu(!showLinkMenu);
              }}
              onMouseEnter={handleFetchLinkStatus}
              disabled={refreshingLinks}
              className="inline-flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10px] leading-tight text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
              title="词条链接管理"
            >
              {refreshingLinks ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Link2 className="size-3.5" />
              )}
              <span className="flex items-center gap-0.5">
                链接
                <ChevronDown className={`size-2.5 transition-transform ${showLinkMenu ? "rotate-180" : ""}`} />
              </span>
            </button>

            {showLinkMenu && (
              <>
                {/* Backdrop to close dropdown */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setShowLinkMenu(false);
                  }}
                />
                {/* Dropdown */}
                <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border border-border bg-popover p-3 shadow-lg">
                  <div className="space-y-2">
                    {/* Link status info */}
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center justify-between">
                        <span>词条链接</span>
                        <span className="font-medium text-foreground">
                          {loadingLinkStatus ? (
                            <Loader2 className="size-3 animate-spin inline" />
                          ) : (
                            linkStatus?.linkCount ?? "-"
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>最后检测</span>
                        <span className="font-medium text-foreground">
                          {loadingLinkStatus ? (
                            <Loader2 className="size-3 animate-spin inline" />
                          ) : linkStatus?.lastDetectedAt ? (
                            formatTimeAgo(linkStatus.lastDetectedAt)
                          ) : (
                            "从未"
                          )}
                        </span>
                      </div>
                    </div>

                    <hr className="border-border" />

                    {/* Actions */}
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          handleRefreshLinks(e);
                          setShowLinkMenu(false);
                        }}
                        disabled={refreshingLinks}
                        className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`size-3.5 ${refreshingLinks ? "animate-spin" : ""}`} />
                        刷新本文链接
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Translate button */}
          <button
            type="button"
            onClick={handleTranslate}
            disabled={translating || hasPendingTranslate}
            className="inline-flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10px] leading-tight text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title={hasPendingTranslate ? "已有翻译任务处理中" : "AI 翻译"}
          >
            <Languages
              className={`size-3.5 ${translating ? "animate-pulse" : hasPendingTranslate ? "text-blue-400" : ""}`}
            />
            <span>{hasPendingTranslate ? "翻译中" : "翻译"}</span>
          </button>

          {/* Discover terms button */}
          <button
            type="button"
            onClick={handleDiscover}
            disabled={discovering || hasPendingDiscover}
            className="inline-flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10px] leading-tight text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title={hasPendingDiscover ? "词条发现任务处理中" : "扫描文章发现新词条"}
          >
            <Sparkles
              className={`size-3.5 ${discovering ? "animate-pulse" : hasPendingDiscover ? "text-yellow-400" : ""}`}
            />
            <span>{hasPendingDiscover ? "发现中" : "发现词条"}</span>
          </button>

          {/* Toggle hidden button */}
          <button
            type="button"
            onClick={handleToggleHidden}
            disabled={togglingHidden}
            className={`inline-flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10px] leading-tight transition-colors disabled:opacity-50 cursor-pointer ${
              article.isHidden
                ? "text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title={article.isHidden ? "取消隐藏" : "隐藏文章"}
          >
            {togglingHidden ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <EyeOff className="size-3.5" />
            )}
            <span>{article.isHidden ? "隐藏" : "隐藏"}</span>
          </button>

          {/* Toggle pinned button */}
          <button
            type="button"
            onClick={handleTogglePinned}
            disabled={togglingPinned}
            className={`inline-flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10px] leading-tight transition-colors disabled:opacity-50 cursor-pointer ${
              article.isPinned
                ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title={article.isPinned ? "取消置顶" : "置顶文章"}
          >
            {togglingPinned ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Pin className="size-3.5" />
            )}
            <span>{article.isPinned ? "置顶" : "置顶"}</span>
          </button>

          {/* Separator */}
          <span className="w-px h-6 bg-border mx-1" />

          {/* Delete button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setShowDelete(true);
            }}
            className="inline-flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10px] leading-tight text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            title="删除"
          >
            <Trash2 className="size-3.5" />
            <span>删除</span>
          </button>
        </div>
      </Link>

      {showDelete && (
        <DeleteModal
          title={article.title}
          itemType="文章"
          onConfirm={handleDelete}
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

// --- Draft Row (linked to published) ---

function LinkedDraftRow({ draft }: { draft: DraftItem }) {
  return (
    <Link
      href={`/admin/articles/${draft.id}/edit`}
      className="flex items-center justify-between rounded-lg border border-dashed border-yellow-300 dark:border-yellow-700 bg-card/50 px-4 py-2.5 ml-6 border-l-2 border-l-yellow-400 transition-colors hover:bg-yellow-50/50 dark:hover:bg-yellow-950/20"
    >
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
      <div className="flex items-center gap-2 shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs text-primary">点击编辑草稿</span>
        <DeleteDraftButton draft={draft} />
      </div>
    </Link>
  );
}

// --- Translation Row (bound to original article) ---

function TranslationRow({ translation }: { translation: TranslationItem }) {
  return (
    <Link
      href={`/${translation.language}/articles/${translation.slug}`}
      className="flex items-center justify-between rounded-lg border border-dashed border-blue-300 dark:border-blue-700 bg-card/50 px-4 py-2.5 ml-6 border-l-2 border-l-blue-400 transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
      target="_blank"
    >
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Globe className="size-3.5 text-blue-500 shrink-0" />
          <span className="text-sm truncate">{translation.title}</span>
          <StatusBadge status={translation.status} />
          {translation.isAITranslated && (
            <span className="text-[10px] text-blue-500 font-medium">AI 翻译</span>
          )}
        </div>
        <ArticleMetaRow
          language={translation.language}
          updatedAt={translation.updatedAt}
          charCount={translation.charCount}
          lineCount={translation.lineCount}
        />
      </div>
      {/* Translations cannot be edited or deleted from here */}
    </Link>
  );
}

// --- Delete Draft Button ---

function DeleteDraftButton({ draft }: { draft: DraftItem }) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
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
    },
    [draft.id, router],
  );

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setShowDelete(true);
        }}
        className="inline-flex items-center rounded-md p-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        title="删除草稿"
      >
        <Trash2 className="size-3.5" />
      </button>
      {showDelete && (
        <DeleteModal
          title={draft.title}
          itemType="草稿"
          onConfirm={handleDelete}
          onCancel={() => {
            setShowDelete(false);
            setError(null);
          }}
          loading={deleting}
        />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </>
  );
}

// --- New Draft Row (no linked article) ---

function NewDraftRow({ draft }: { draft: DraftItem }) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
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
    },
    [draft.id, router],
  );

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
      <Link
        href={`/admin/articles/${draft.id}/edit`}
        className="flex items-center justify-between rounded-lg border border-dashed border-yellow-300 dark:border-yellow-700 bg-card px-4 py-3 ml-6 border-l-2 border-l-yellow-400 transition-colors hover:bg-yellow-50/50 dark:hover:bg-yellow-950/20"
      >
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
        <div className="flex items-center gap-1 shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-primary">点击编辑草稿</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setShowDelete(true);
            }}
            className="inline-flex items-center rounded-md p-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="删除草稿"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </Link>

      {showDelete && (
        <DeleteModal
          title={draft.title}
          itemType="草稿"
          onConfirm={handleDelete}
          onCancel={() => {
            setShowDelete(false);
            setError(null);
          }}
          loading={deleting}
        />
      )}
    </div>
  );
}

// --- Main Component ---

export function ArticleRowActions({
  articles,
  translations,
  drafts,
  newDrafts,
  pendingTasks,
}: ArticleRowActionsProps) {
  return (
    <>
      {articles.map((article) => {
        const linkedDraft = drafts.find((d) => d.draftOfId === article.id);
        const linkedTranslation = translations.find((t) => t.originalId === article.id);
        const activeTaskTypes = pendingTasks[article.id] || [];

        return (
          <div key={article.id} className="flex flex-col gap-1">
            <PublishedArticleRow
              article={article}
              hasDraft={!!linkedDraft}
              activeTaskTypes={activeTaskTypes}
            />
            {/* Translation version appears above draft */}
            {linkedTranslation && <TranslationRow translation={linkedTranslation} />}
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
