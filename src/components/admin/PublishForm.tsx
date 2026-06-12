"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Send,
  AlertCircle,
  Check,
  Loader2,
  Save,
  Sparkles,
  ArrowLeft,
  FileText,
  Info,
  Download,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import matter from "gray-matter";
import { FileUploader, type UploadResult } from "./FileUploader";
import { computeDiff, type DiffLine } from "@/lib/diff";

const FILE_TYPES = [
  { value: "markdown", label: "Markdown" },
  { value: "notesaw", label: "Notesaw" },
] as const;

type Step = "upload" | "review" | "confirm";

interface ArticleMeta {
  title: string;
  language: "zh" | "en";
  fileType: "markdown" | "notesaw";
  tags: string[];
  author: string;
  summary: string;
}

interface PublishFormProps {
  /** If editing an existing draft, pass the draft ID */
  draftId?: string;
  /** If editing an existing published article, pass its ID */
  publishedId?: string;
  /** Pre-filled content when editing */
  initialContent?: string;
  initialFileName?: string;
  initialMeta?: ArticleMeta;
  /** Extra frontmatter fields not managed by UI */
  initialExtraFrontmatter?: Record<string, unknown>;
}

export function PublishForm({
  draftId: existingDraftId,
  publishedId,
  initialContent,
  initialFileName,
  initialMeta,
  initialExtraFrontmatter,
}: PublishFormProps) {
  // Step management
  const [step, setStep] = useState<Step>(initialContent ? "review" : "upload");

  // Upload state
  const [fileName, setFileName] = useState<string>(initialFileName || "");
  const [fileContent, setFileContent] = useState<string>(initialContent || "");

  // Metadata state
  const [meta, setMeta] = useState<ArticleMeta>(
    initialMeta || {
      title: "",
      language: "zh",
      fileType: "markdown",
      tags: [],
      author: "博主",
      summary: "",
    },
  );

  // Extra frontmatter fields (not managed by UI)
  const [extraFrontmatter, setExtraFrontmatter] = useState<Record<string, unknown>>(
    initialExtraFrontmatter || {},
  );

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Draft tracking
  const [draftId, setDraftId] = useState<string | null>(existingDraftId || null);

  // Step 3: Confirm state
  const [changelog, setChangelog] = useState("");

  // UI state
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ slug: string; url: string } | null>(null);

  // AI Review state
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [reviewSummary, setReviewSummary] = useState<{
    totalIssues: number;
    errors: number;
    warnings: number;
    suggestions: number;
  } | null>(null);
  const [reviewProgress, setReviewProgress] = useState<{
    totalChunks: number;
    processedChunks: number;
  } | null>(null);
  const [reviewPolling, setReviewPolling] = useState(false);
  // When true, the review button is locked (already submitted or waiting)
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  // Confirm dialog for re-review
  const [showReviewConfirm, setShowReviewConfirm] = useState(false);

  // Restore review state when loading an existing draft
  useEffect(() => {
    if (!draftId) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/admin/reviews?articleId=${encodeURIComponent(draftId)}&limit=1`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const tasks = data.tasks as Array<{
          id: string;
          status: string;
          output: Record<string, unknown> | null;
        }>;
        if (tasks.length === 0) return;

        // Pick the most recent review task for this draft
        const latest = tasks[0];
        setReviewTaskId(latest.id);
        setReviewStatus(latest.status);
        // Restore the "已提交审查" state so the button shows correctly on refresh
        setReviewSubmitted(true);

        if (latest.status === "completed" && latest.output) {
          const summary = (latest.output as Record<string, unknown>).summary as
            | {
                totalIssues: number;
                errors: number;
                warnings: number;
                suggestions: number;
              }
            | undefined;
          if (summary) {
            setReviewSummary(summary);
          }
        }
      } catch {
        // Silently ignore — the review section will show "no review" state
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftId]);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      const interval = (window as unknown as Record<string, unknown>).__reviewPollInterval as
        | number
        | undefined;
      if (interval) {
        clearInterval(interval);
        delete (window as unknown as Record<string, unknown>).__reviewPollInterval;
      }
    };
  }, []);

  // Preview
  const [previewLoading, setPreviewLoading] = useState(false);

  // Diff for confirm step
  const [diffResult, setDiffResult] = useState<{
    lines: DiffLine[];
    added: number;
    removed: number;
  } | null>(null);

  const handleUpload = useCallback((result: UploadResult) => {
    setFileName(result.fileName);
    setFileContent(result.fileContent);

    // Parse frontmatter using gray-matter
    try {
      const parsed = matter(result.fileContent);
      const data = parsed.data as Record<string, unknown>;

      setMeta({
        title: (data.title as string) || "",
        language: (data.language === "en" ? "en" : "zh") as "zh" | "en",
        fileType: (data.fileType || data.contentType || "markdown") as "markdown" | "notesaw",
        tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
        author: (data.author as string) || "博主",
        summary: (data.summary as string) || "",
      });

      // Collect extra frontmatter
      const managedKeys = new Set([
        "title",
        "language",
        "fileType",
        "contentType",
        "tags",
        "author",
        "summary",
        "slug",
        "accessGroup",
        "changelog",
      ]);
      const extra: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (!managedKeys.has(key)) {
          extra[key] = value;
        }
      }
      setExtraFrontmatter(extra);
    } catch {
      // Ignore parse errors, use defaults
    }

    setPreviewHtml(null);
    setShowPreview(false);
    setError(null);
    setPublished(null);
    setDraftId(null);
    // Reset review state — re-uploading a file should allow re-trigger
    setReviewTaskId(null);
    setReviewStatus(null);
    setReviewSummary(null);
    setReviewProgress(null);
    setReviewSubmitted(false);
    setShowReviewConfirm(false);
  }, []);

  const handleRefreshPreview = useCallback(async () => {
    if (!fileContent) return;
    setPreviewLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/articles/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: fileContent, contentType: meta.fileType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "预览失败");
        return;
      }
      setPreviewHtml(data.html);
      setShowPreview(true);
    } catch {
      setError("预览请求失败");
    } finally {
      setPreviewLoading(false);
    }
  }, [fileContent, meta.fileType]);

  const getMetaPayload = useCallback(() => meta, [meta]);

  const handleSaveDraft = useCallback(async () => {
    if (!fileName || !fileContent) return;
    if (!meta.title.trim()) {
      setError("标题不能为空");
      return;
    }

    setSavingDraft(true);
    setError(null);
    try {
      const res = await fetch("/api/articles/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          fileContent,
          meta: getMetaPayload(),
          draftOfId: publishedId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存草稿失败");
        return;
      }
      setDraftId(data.draft.id);

      // Redirect to admin articles list with a success flag
      window.location.href = "/admin/articles?draft_saved=1";
    } catch {
      setError("保存草稿请求失败");
    } finally {
      setSavingDraft(false);
    }
  }, [fileName, fileContent, meta, publishedId, getMetaPayload]);

  const handleSubmitReview = useCallback(async () => {
    if (!fileName || !fileContent) return;
    if (!meta.title.trim()) {
      setError("标题不能为空");
      return;
    }

    // Prevent double submission
    if (reviewSubmitted) return;

    // First save as draft if not yet saved
    setSavingDraft(true);
    setError(null);
    setReviewTaskId(null);
    setReviewStatus(null);
    setReviewSummary(null);

    try {
      let currentDraftId = draftId;

      if (!currentDraftId) {
        const draftRes = await fetch("/api/articles/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName,
            fileContent,
            meta: getMetaPayload(),
            draftOfId: publishedId || null,
          }),
        });
        const draftData = await draftRes.json();
        if (!draftRes.ok) {
          setError(draftData.error || "保存草稿失败");
          return;
        }
        currentDraftId = draftData.draft.id;
        setDraftId(currentDraftId);

        // Redirect to draft editor — the review will be visible there
        window.location.href = `/admin/articles/${currentDraftId}/edit?review_triggered=1`;
        return;
      }

      // Mark as submitted — prevent re-trigger until file re-upload
      setReviewSubmitted(true);

      // Trigger AI review
      const reviewRes = await fetch("/api/ai/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: currentDraftId }),
      });
      const reviewData = await reviewRes.json();
      if (!reviewRes.ok) {
        setReviewSubmitted(false);
        setError(reviewData.error || "触发审查失败");
        return;
      }

      const taskId = reviewData.taskId;
      setReviewTaskId(taskId);
      setReviewStatus("pending");

      // Start polling for results
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/ai/status/${taskId}`);
          if (!statusRes.ok) {
            clearInterval(pollInterval);
            return;
          }
          const statusData = await statusRes.json();
          const newStatus = statusData.status as string;
          setReviewStatus(newStatus);

          // Show chunk progress during processing
          if (newStatus === "processing") {
            const output = (statusData.output ?? {}) as Record<string, unknown>;
            const progress = output.progress as
              | {
                  totalChunks: number;
                  processedChunks: number;
                }
              | undefined;
            if (progress) {
              setReviewProgress(progress);
            }
          }

          if (newStatus === "completed") {
            clearInterval(pollInterval);
            const output = (statusData.output ?? {}) as Record<string, unknown>;
            const summary = output.summary as
              | {
                  totalIssues: number;
                  errors: number;
                  warnings: number;
                  suggestions: number;
                }
              | undefined;
            if (summary) {
              setReviewSummary(summary);
            }
            // Clear progress once complete
            setReviewProgress(null);
          } else if (newStatus === "failed") {
            clearInterval(pollInterval);
            setError(`审查失败: ${statusData.error || "未知错误"}`);
          }
        } catch {
          // Ignore polling errors, continue retrying
        }
      }, 2000);

      // Store interval reference for cleanup
      (window as unknown as Record<string, unknown>).__reviewPollInterval = pollInterval;
    } catch {
      setError("提交审查请求失败");
    } finally {
      setSavingDraft(false);
    }
  }, [fileName, fileContent, meta, publishedId, draftId, getMetaPayload]);

  const handleGoToConfirm = useCallback(async () => {
    if (!fileContent) return;
    if (!meta.title.trim()) {
      setError("标题不能为空");
      return;
    }
    setError(null);

    // Generate diff against previous version (if updating)
    if (publishedId) {
      try {
        const res = await fetch(`/api/articles/content?id=${publishedId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.content) {
            const diff = computeDiff(data.content, fileContent);
            setDiffResult(diff);
          }
        }
      } catch {
        // No previous content to diff against
      }
    }

    setStep("confirm");
  }, [fileContent, meta.title, publishedId]);

  const handlePublish = useCallback(async () => {
    if (!fileContent) return;

    setPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/articles/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: meta.language,
          meta: getMetaPayload(),
          changelog: changelog || undefined,
          draftOfId: publishedId || null,
          fileContent,
          ...(draftId ? { draftId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "发布失败");
        setPublishing(false);
        return;
      }

      setPublished(data.article);
    } catch {
      setError("发布请求失败");
    } finally {
      setPublishing(false);
    }
  }, [fileName, fileContent, meta, changelog, publishedId, getMetaPayload]);

  // Stats
  const lineCount = fileContent ? fileContent.split("\n").length : 0;
  const charCount = fileContent ? fileContent.length : 0;

  // Download handler
  const handleDownload = useCallback(() => {
    if (!fileContent) return;
    const blob = new Blob([fileContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "article.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [fileContent, fileName]);

  // Render meta editor (shared between step 1 and 2)
  const renderMetaEditor = () => (
    <div className="space-y-4">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="meta-title">
          标题 <span className="text-destructive">*</span>
        </Label>
        <input
          id="meta-title"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="文章标题"
          value={meta.title}
          onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
        />
      </div>

      {/* Language + File Type in a row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="meta-language">语言</Label>
          <Select
            value={meta.language}
            onValueChange={(v) => setMeta((m) => ({ ...m, language: v as "zh" | "en" }))}
          >
            <SelectTrigger id="meta-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh">中文</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="meta-filetype">文件格式</Label>
          <Select
            value={meta.fileType}
            onValueChange={(v) => setMeta((m) => ({ ...m, fileType: v as "markdown" | "notesaw" }))}
          >
            <SelectTrigger id="meta-filetype">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILE_TYPES.map((ft) => (
                <SelectItem key={ft.value} value={ft.value}>
                  {ft.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Author + Tags in a row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="meta-author">作者</Label>
          <input
            id="meta-author"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="博主"
            value={meta.author}
            onChange={(e) => setMeta((m) => ({ ...m, author: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>标签</Label>
          <div className="flex flex-wrap gap-1.5 mb-1.5 min-h-7">
            {meta.tags.map((tag, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="gap-1 cursor-pointer text-xs"
                onClick={() =>
                  setMeta((m) => ({
                    ...m,
                    tags: m.tags.filter((_, j) => j !== i),
                  }))
                }
              >
                {tag}
                <span className="text-muted-foreground hover:text-foreground ml-0.5">&times;</span>
              </Badge>
            ))}
          </div>
          <input
            id="meta-tags"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="输入标签后按回车添加"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                const input = e.currentTarget;
                const val = input.value.trim();
                if (val && !meta.tags.includes(val)) {
                  setMeta((m) => ({ ...m, tags: [...m.tags, val] }));
                }
                input.value = "";
              }
            }}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-2">
        <Label htmlFor="meta-summary">摘要</Label>
        <textarea
          id="meta-summary"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          rows={2}
          placeholder="文章摘要（可选）"
          value={meta.summary}
          onChange={(e) => setMeta((m) => ({ ...m, summary: e.target.value }))}
        />
      </div>

      {/* Extra frontmatter fields (read-only display) */}
      {Object.keys(extraFrontmatter).length > 0 && (
        <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 mb-1.5 font-medium">
            <Info className="size-3" />
            额外的元信息（自动保留）
          </div>
          {Object.entries(extraFrontmatter).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="font-mono shrink-0">{key}:</span>
              <span className="truncate">{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Render diff lines for confirm step
  const renderDiff = () => {
    if (!diffResult) return null;

    return (
      <div className="rounded-lg border border-border overflow-hidden text-xs font-mono">
        {diffResult.lines.map((line, idx) => {
          let bg = "";
          let prefix = " ";
          if (line.type === "added") {
            bg = "bg-green-50 dark:bg-green-950/30";
            prefix = "+";
          } else if (line.type === "removed") {
            bg = "bg-red-50 dark:bg-red-950/30";
            prefix = "-";
          }
          return (
            <div
              key={idx}
              className={`flex ${bg} px-3 py-0.5 border-b border-border/50 last:border-b-0`}
            >
              <span className="w-8 text-right text-muted-foreground/50 select-none shrink-0">
                {line.lineNumOld || line.lineNumNew || " "}
              </span>
              <span className="w-4 text-center shrink-0 text-muted-foreground/50 select-none">
                {prefix}
              </span>
              <span className="flex-1 pl-1 whitespace-pre-wrap break-all">{line.value || " "}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // --- Step 1: Upload ---
  if (step === "upload") {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">发布文章</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            上传 Markdown 文件，编辑元信息，然后发布或保存为草稿
          </p>
        </div>

        {/* File upload */}
        <Card className="p-6">
          <FileUploader onUpload={handleUpload} />
        </Card>

        {fileContent && (
          <>
            {/* Metadata editor */}
            <Card className="p-6">
              <h3 className="text-sm font-medium mb-4">元信息</h3>
              {renderMetaEditor()}
            </Card>

            {/* Preview */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">预览</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshPreview}
                  disabled={previewLoading}
                >
                  {previewLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      渲染中
                    </>
                  ) : (
                    "刷新预览"
                  )}
                </Button>
              </div>

              {showPreview && previewHtml ? (
                <div className="markdown-body rounded-lg border p-4">
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-lg border border-dashed p-12 text-sm text-muted-foreground">
                  点击「刷新预览」查看渲染结果
                </div>
              )}
            </Card>

            {/* Action buttons — only save as draft or go to confirm, no review here */}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={handleSaveDraft} disabled={savingDraft}>
                {savingDraft ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                存为草稿
              </Button>

              <Button onClick={handleGoToConfirm} disabled={!fileContent}>
                <Send className="size-4" />
                下一步 · 确认发布
              </Button>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                {error}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // --- Step 2: Review (Edit Draft) ---
  if (step === "review") {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setError(null);
              setStep("upload");
            }}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">编辑草稿</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              修改元信息，预览效果，然后提交审查或继续发布
            </p>
          </div>
        </div>

        {/* File info */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <FileText className="size-3" />
                {fileName}
              </Badge>
              {draftId && <Badge variant="outline">草稿</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                className="gap-1.5 text-xs"
              >
                <Download className="size-3.5" />
                下载
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError(null);
                  setStep("upload");
                }}
                className="gap-1.5 text-xs"
              >
                <Upload className="size-3.5" />
                重新上传
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{lineCount} 行</Badge>
            <Badge variant="outline">{charCount} 字符</Badge>
          </div>
        </Card>

        {/* Metadata editor */}
        <Card className="p-6">
          <h3 className="text-sm font-medium mb-4">元信息</h3>
          {renderMetaEditor()}
        </Card>

        {/* AI Review Status */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">AI 审查</h3>
            {reviewTaskId && (
              <a
                href={`/admin/reviews/${reviewTaskId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                查看详情 &rarr;
              </a>
            )}
          </div>

          {!reviewTaskId && !reviewStatus && (
            <p className="text-sm text-muted-foreground">点击「交给助手审查」按钮发起 AI 审查。</p>
          )}

          {reviewTaskId && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {reviewStatus === "pending" && (
                  <>
                    <div className="size-3 rounded-full bg-slate-400 animate-pulse" />
                    <span className="text-sm text-muted-foreground">等待处理...</span>
                  </>
                )}
                {reviewStatus === "processing" && (
                  <>
                    <Loader2 className="size-3.5 animate-spin text-blue-500" />
                    <span className="text-sm text-blue-600 dark:text-blue-400">AI 正在审查...</span>
                    {reviewProgress && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({reviewProgress.processedChunks}/{reviewProgress.totalChunks} 段落)
                      </span>
                    )}
                    {/* Progress bar */}
                    {reviewProgress && reviewProgress.totalChunks > 0 && (
                      <div className="w-full mt-1.5">
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-500"
                            style={{
                              width: `${(reviewProgress.processedChunks / reviewProgress.totalChunks) * 100}%`,
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          已处理 {reviewProgress.processedChunks}/{reviewProgress.totalChunks}{" "}
                          个段落
                        </p>
                      </div>
                    )}
                  </>
                )}
                {reviewStatus === "completed" && (
                  <>
                    <Check className="size-3.5 text-green-500" />
                    <span className="text-sm text-green-600 dark:text-green-400">审查完成</span>
                  </>
                )}
                {reviewStatus === "failed" && (
                  <>
                    <AlertCircle className="size-3.5 text-red-500" />
                    <span className="text-sm text-red-600 dark:text-red-400">审查失败</span>
                  </>
                )}
              </div>

              {reviewSummary && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span className="text-red-600 dark:text-red-400">
                    {reviewSummary.errors} 错误
                  </span>
                  <span className="text-yellow-600 dark:text-yellow-400">
                    {reviewSummary.warnings} 警告
                  </span>
                  <span className="text-blue-600 dark:text-blue-400">
                    {reviewSummary.suggestions} 建议
                  </span>
                  <span>共 {reviewSummary.totalIssues} 个问题</span>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Preview */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">预览</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshPreview}
              disabled={previewLoading}
            >
              {previewLoading ? <Loader2 className="size-4 animate-spin" /> : "刷新预览"}
            </Button>
          </div>

          {showPreview && previewHtml ? (
            <div className="markdown-body rounded-lg border p-4">
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed p-12 text-sm text-muted-foreground">
              点击「刷新预览」查看渲染结果
            </div>
          )}
        </Card>

        {/* Re-review confirm dialog */}
        {showReviewConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowReviewConfirm(false)}
          >
            <div
              className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-2">重新提交审查？</h3>
              <p className="text-sm text-muted-foreground mb-6">
                这篇文章已经提交过 AI 审查，确定要再次提交吗？
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowReviewConfirm(false)}>
                  取消
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowReviewConfirm(false);
                    handleSubmitReview();
                  }}
                >
                  <Sparkles className="size-4" />
                  确认重新审查
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={savingDraft}
            className="sm:order-1"
          >
            {savingDraft ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            存为草稿
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (reviewSubmitted) {
                setShowReviewConfirm(true);
              } else {
                handleSubmitReview();
              }
            }}
            disabled={savingDraft || (reviewSubmitted && reviewStatus === "processing")}
            className="sm:order-2"
          >
            <Sparkles className="size-4" />
            {reviewSubmitted ? "已提交审查" : "交给助手审查"}
          </Button>
          <Button onClick={handleGoToConfirm} className="sm:order-3">
            <Send className="size-4" />
            上传 · 进入确认页
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}
      </div>
    );
  }

  // --- Step 3: Confirm ---
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setError(null);
            setStep("review");
          }}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">确认发布</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看元信息和变更内容，填写 changelog，确认后发布
          </p>
        </div>
      </div>

      {/* Final metadata summary */}
      <Card className="p-6">
        <h3 className="text-sm font-medium mb-3">元信息</h3>
        <div className="grid gap-2 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground shrink-0 w-16">标题：</span>
            <span className="font-medium">{meta.title}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground shrink-0 w-16">语言：</span>
            <span>{meta.language === "zh" ? "中文" : "English"}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground shrink-0 w-16">格式：</span>
            <span>{meta.fileType === "notesaw" ? "Notesaw" : "Markdown"}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground shrink-0 w-16">作者：</span>
            <span>{meta.author}</span>
          </div>
          {meta.tags.length > 0 && (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0 w-16">标签：</span>
              <div className="flex flex-wrap gap-1">
                {meta.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {meta.summary && (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0 w-16">摘要：</span>
              <span className="text-muted-foreground">{meta.summary}</span>
            </div>
          )}
          {Object.keys(extraFrontmatter).length > 0 && (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0 w-16">其他：</span>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {Object.entries(extraFrontmatter).map(([key, value]) => (
                  <div key={key}>
                    <span className="font-mono">{key}:</span> {String(value)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* File info */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <Badge variant="outline" className="gap-1">
            <FileText className="size-3" />
            {fileName}
          </Badge>
          <Button variant="ghost" size="sm" onClick={handleDownload} className="gap-1.5 text-xs">
            <Download className="size-3.5" />
            下载
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{lineCount} 行</Badge>
          <Badge variant="outline">{charCount} 字符</Badge>
          {diffResult && (
            <>
              <Badge
                variant="outline"
                className="border-green-500 text-green-700 dark:text-green-400"
              >
                +{diffResult.added} 行
              </Badge>
              <Badge variant="outline" className="border-red-500 text-red-700 dark:text-red-400">
                -{diffResult.removed} 行
              </Badge>
            </>
          )}
        </div>
      </Card>

      {/* Diff view */}
      {diffResult && (
        <Card className="p-6">
          <h3 className="text-sm font-medium mb-3">变更对比</h3>
          {renderDiff()}
        </Card>
      )}

      {!diffResult && publishedId && (
        <Card className="p-6">
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            正在加载上一版本内容以生成对比...
          </div>
        </Card>
      )}

      {/* Changelog */}
      <Card className="p-6">
        <div className="space-y-2">
          <Label htmlFor="changelog">变更说明 (Changelog)</Label>
          <textarea
            id="changelog"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            rows={3}
            placeholder="描述本次变更内容（可选）"
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">AI 生成建议版本功能将在后续版本中实现。</p>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Success */}
      {published ? (
        <div className="flex items-center gap-3 rounded-lg bg-green-50 dark:bg-green-950 p-4 text-sm">
          <Check className="size-5 text-green-600 dark:text-green-400" />
          <div>
            <p className="font-medium text-green-800 dark:text-green-300">发布成功！</p>
            <a
              href={published.url}
              className="text-green-700 dark:text-green-400 underline underline-offset-2 hover:text-green-600"
            >
              {published.url}
            </a>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              setStep("review");
            }}
            disabled={publishing}
            className="sm:order-1"
          >
            <ArrowLeft className="size-4" />
            取消上传
          </Button>
          <Button onClick={handlePublish} disabled={publishing} className="sm:order-2">
            {publishing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                发布中
              </>
            ) : (
              <>
                <Send className="size-4" />
                确认发布
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
