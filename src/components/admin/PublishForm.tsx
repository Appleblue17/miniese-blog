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
  language: "zh" | "en" | "";
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
  const [meta, setMeta] = useState<ArticleMeta>({
    title: "",
    language: "",
    fileType: "markdown",
    tags: [],
    author: "",
    summary: "",
  });

  // Extra frontmatter fields (not managed by UI)
  const [extraFrontmatter, setExtraFrontmatter] = useState<Record<string, unknown>>({});

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

  // Load default author from settings and apply initial values
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) return;
        const settings = await res.json();
        if (cancelled) return;

        const defaultAuthor = settings.publish?.defaultAuthor || "博主";

        setMeta((prev) => ({
          ...prev,
          author: initialMeta?.author || defaultAuthor,
          title: initialMeta?.title || prev.title,
          language: initialMeta?.language || prev.language,
          fileType: initialMeta?.fileType || prev.fileType,
          tags: initialMeta?.tags || prev.tags,
          summary: initialMeta?.summary || prev.summary,
        }));

        if (initialExtraFrontmatter) {
          setExtraFrontmatter(initialExtraFrontmatter);
        }
      } catch {
        // Use defaults
        if (initialMeta) {
          setMeta((prev) => ({ ...prev, ...initialMeta }));
        }
        if (initialExtraFrontmatter) {
          setExtraFrontmatter(initialExtraFrontmatter);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // AI Review state — only used for triggering, no inline status display
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

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
        const tasks = data.tasks as Array<{ id: string }>;
        if (tasks.length === 0) return;

        setReviewTaskId(tasks[0].id);
        setReviewSubmitted(true);
      } catch {
        // Silently ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftId]);

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

    // Parse frontmatter using gray-matter (already done in FileUploader, but re-parse here for extra fields)
    try {
      const parsed = matter(result.fileContent);
      const data = parsed.data as Record<string, unknown>;

      const fileLanguage = (data.language === "en" ? "en" : data.language === "zh" ? "zh" : "") as "zh" | "en" | "";
      const fileTitle = (data.title as string) || result.title;
      const fileAuthor = (data.author as string) || result.author || meta.author;
      const fileTags = Array.isArray(data.tags) ? (data.tags as string[]) : result.tags;
      const fileSummary = (data.summary as string) || result.summary;

      setMeta({
        title: fileTitle,
        language: fileLanguage,
        fileType: (data.fileType || data.contentType || "markdown") as "markdown" | "notesaw",
        tags: fileTags,
        author: fileAuthor,
        summary: fileSummary,
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
      // Use values from UploadResult
      setMeta((prev) => ({
        ...prev,
        title: result.title || prev.title,
        language: (result.language === "en" || result.language === "zh" ? result.language : "") as "zh" | "en" | "",
        author: result.author || prev.author,
        tags: result.tags,
        summary: result.summary || "",
      }));
    }

    setPreviewHtml(null);
    setShowPreview(false);
    setError(null);
    setPublished(null);
    setDraftId(null);
    // Reset review state — re-uploading a file should allow re-trigger
    setReviewTaskId(null);
    setReviewSubmitted(false);
  }, [meta.author]);

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
    if (!meta.language) {
      setError("请选择语言");
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
    if (!meta.language) {
      setError("请选择语言");
      return;
    }

    // Prevent double submission
    if (reviewSubmitted) return;

    // First save as draft if not yet saved
    setSavingDraft(true);
    setError(null);

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

      // Trigger AI review
      const reviewRes = await fetch("/api/ai/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: currentDraftId }),
      });
      const reviewData = await reviewRes.json();
      if (!reviewRes.ok) {
        setError(reviewData.error || "触发审查失败");
        return;
      }

      const taskId = reviewData.taskId;
      // Mark as submitted — prevent re-trigger
      setReviewSubmitted(true);

      // Redirect to task detail page
      window.location.href = `/admin/reviews/${taskId}`;
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
    if (!meta.language) {
      setError("请选择语言");
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
          <Label htmlFor="meta-language">
            语言 <span className="text-destructive">*</span>
          </Label>
          <Select
            value={meta.language}
            onValueChange={(v) => setMeta((m) => ({ ...m, language: v as "zh" | "en" | "" }))}
          >
            <SelectTrigger id="meta-language">
              <SelectValue placeholder="选择语言" />
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
            onClick={handleSubmitReview}
            disabled={savingDraft || reviewSubmitted}
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
            <span>{meta.language === "zh" ? "中文" : meta.language === "en" ? "English" : "未选择"}</span>
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
