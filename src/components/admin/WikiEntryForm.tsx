/**
 * @file WikiEntryForm - Create/edit form for wiki entries.
 *
 * Create mode: only name + language (creates a WikiDiscovery pending entry,
 * AI automatically refines type/definition/importance).
 * Edit mode: full form with all fields (only for unreviewed/reviewed entries).
 * Edit mode also includes a review button (unreviewed → reviewed).
 *
 * NOTE: Create and Edit modes are implemented as separate internal components
 * to comply with React hooks rules (hooks must not be called conditionally).
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Save, CheckCircle2, X, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WikiStatus } from "@/types/wiki";

// --- Schema ---

const createSchema = z.object({
  name: z.string().min(1, "主名称不能为空"),
  language: z.enum(["zh", "en"]),
});

const editSchema = z.object({
  name: z.string().min(1, "主名称不能为空"),
  aliases: z.string().optional(),
  language: z.enum(["zh", "en"]),
  definition: z.string().optional(),
  human: z.string().optional(),
  ai: z.string().optional(),
  ref: z.string().optional(),
  tags: z.string().optional(),
  accessGroup: z.string().optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;
type EditFormValues = z.infer<typeof editSchema>;

export interface WikiEntryBlockData {
  definition: string;
  human: string;
  ai: string;
  ref: string;
}

export interface WikiEntryInitialData {
  id: string;
  name: string;
  aliases: string[];
  language: string;
  definition: string;
  tags: string[];
  accessGroup: string[];
  status: WikiStatus;
  createdAt: string;
  updatedAt: string;
  blocks: WikiEntryBlockData;
}

interface WikiEntryFormProps {
  mode: "create" | "edit";
  initialData?: WikiEntryInitialData;
}

// --- Tag input component ---

function TagInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-1">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "输入后按回车添加"}
          className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag}>
          添加
        </Button>
      </div>
    </div>
  );
}

// --- Create Form (internal component) ---

/** AI-refined term data shown in preview step */
interface AiPreview {
  type: string;
  definition: string;
  importance: number;
}

function CreateForm() {
  const router = useRouter();
  const [step, setStep] = useState<"input" | "preview">("input");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [preview, setPreview] = useState<AiPreview | null>(null);
  const [editDefinition, setEditDefinition] = useState("");

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      language: "zh",
    },
  });

  const name = form.watch("name");
  const language = form.watch("language");

  /** Step 1: Call AI to refine the term and show preview */
  const handleAnalyze = async () => {
    const valid = await form.trigger();
    if (!valid) return;

    setRefining(true);
    setError(null);

    try {
      // Call a lightweight AI refine first (not creating the record yet)
      const res = await fetch("/api/ai/refine-term", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), language }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "AI 分析失败");
      }

      const data = await res.json();
      setPreview({
        type: data.type || "concept",
        definition: data.definition || "",
        importance: typeof data.importance === "number" ? data.importance : 0.5,
      });
      setEditDefinition(data.definition || "");
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 分析请求失败");
    } finally {
      setRefining(false);
    }
  };

  /** Step 2: Submit the confirmed term as a WikiDiscovery */
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          language,
          overrideDefinition: editDefinition,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "创建失败");
        setSubmitting(false);
        return;
      }

      router.push("/admin/wiki?status=pending&page=1");
      router.refresh();
    } catch {
      setError("请求失败，请检查网络连接");
      setSubmitting(false);
    }
  };

  const typeLabel = (t: string) => {
    switch (t) {
      case "acronym": return "缩写";
      case "concept": return "概念";
      case "theorem": return "定理";
      case "tech": return "技术";
      default: return "其他";
    }
  };

  const typeColor = (t: string) => {
    switch (t) {
      case "acronym": return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
      case "concept": return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
      case "theorem": return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
      case "tech": return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300";
      default: return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    }
  };

  if (step === "preview" && preview) {
    return (
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setStep("input"); setPreview(null); setError(null); }}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            &larr; 返回修改
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-bold mb-4">AI 分析结果</h2>

          <div className="flex flex-col gap-4">
            {/* Term + type */}
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold">{name}</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColor(preview.type)}`}>
                {typeLabel(preview.type)}
              </span>
              <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                {language === "zh" ? "中文" : "EN"}
              </span>
            </div>

            {/* Importance bar */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground shrink-0">重要性:</span>
              <div className="flex-1 max-w-xs">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className={`h-2 rounded-full ${preview.importance >= 0.9 ? "bg-green-500" : preview.importance >= 0.7 ? "bg-blue-500" : preview.importance >= 0.5 ? "bg-yellow-500" : "bg-slate-300 dark:bg-slate-600"}`}
                      style={{ width: `${Math.round(preview.importance * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                    {Math.round(preview.importance * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Definition (editable) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">简短定义（可编辑）</label>
              <textarea
                value={editDefinition}
                onChange={(e) => setEditDefinition(e.target.value)}
                rows={2}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-y"
                placeholder="AI 生成的简短定义..."
              />
              <p className="text-xs text-muted-foreground">
                您可以修改 AI 生成的简短定义，修改后仍将提交为申请。
              </p>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            <Sparkles className="size-4 mr-2" />
            {submitting ? "提交中..." : "确认提交申请"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => { setStep("input"); setPreview(null); setError(null); }}
            disabled={submitting}
          >
            返回修改
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">
          主名称 <span className="text-destructive">*</span>
        </label>
        <input
          {...form.register("name")}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          placeholder="例如: DFS, 勾股定理"
        />
        {form.formState.errors.name && (
          <p className="text-xs text-destructive">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>

      {/* Language */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">语言</label>
        <select
          {...form.register("language")}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </div>

      {/* Hint */}
      <p className="text-xs text-muted-foreground">
        输入词条名称后点击&ldquo;AI 分析&rdquo;，系统将自动分析词条类型和重要性，供您确认后提交申请。
      </p>

      {/* Refining indicator */}
      {refining && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-400">
          <Sparkles className="size-4 animate-pulse" />
          AI 正在分析词条...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="button" onClick={handleAnalyze} disabled={refining}>
          {refining && <Loader2 className="size-4 animate-spin mr-2" />}
          <Sparkles className="size-4 mr-2" />
          {refining ? "分析中..." : "AI 分析"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/wiki")}
        >
          取消
        </Button>
      </div>
    </div>
  );
}

// --- Edit Form (internal component) ---

function EditForm({ initialData }: { initialData: WikiEntryInitialData }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(initialData.tags || []);
  const [aliases, setAliases] = useState<string[]>(initialData.aliases || []);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: initialData.name || "",
      aliases: initialData.aliases?.join(", ") || "",
      language: (initialData.language as "zh" | "en") || "zh",
      definition: initialData.blocks?.definition || initialData.definition || "",
      human: initialData.blocks?.human || "",
      ai: initialData.blocks?.ai || "",
      ref: initialData.blocks?.ref || "",
      tags: initialData.tags?.join(", ") || "",
    },
  });

  const onSave = async (values: EditFormValues) => {
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: values.name,
        aliases: aliases.length > 0 ? aliases : [],
        language: values.language,
        definition: values.definition,
        human: values.human,
        ai: values.ai,
        ref: values.ref,
        tags: tags.length > 0 ? tags : [],
      };

      const res = await fetch(
        `/api/wiki/${encodeURIComponent(initialData.name)}?lang=${initialData.language}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "保存失败");
        setSubmitting(false);
        return;
      }

      router.push("/admin/wiki");
      router.refresh();
    } catch {
      setError("请求失败，请检查网络连接");
      setSubmitting(false);
    }
  };

  const handleReview = async () => {
    setReviewing(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/wiki/${encodeURIComponent(initialData.name)}/review?lang=${initialData.language}`,
        { method: "POST" },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "审查失败");
        setReviewing(false);
        return;
      }

      router.push("/admin/wiki");
      router.refresh();
    } catch {
      setError("审查请求失败");
      setReviewing(false);
    }
  };

  const canReview = initialData.status === "unreviewed";

  return (
    <form onSubmit={form.handleSubmit(onSave)} className="flex flex-col gap-6">
      {/* Status info */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
        当前状态：
        <span className="font-medium ml-1">
          {initialData.status === "creating"
            ? "生成中"
            : initialData.status === "unreviewed"
              ? "待审查"
              : "已审查"}
        </span>
      </div>

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">
          主名称 <span className="text-destructive">*</span>
        </label>
        <input
          {...form.register("name")}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          placeholder="例如: DFS, 勾股定理"
        />
        {form.formState.errors.name && (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      {/* Aliases */}
      <TagInput
        label="别名"
        value={aliases}
        onChange={setAliases}
        placeholder="输入别名后按回车添加"
      />

      {/* Language */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">语言</label>
        <select
          {...form.register("language")}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </div>

      {/* Tags */}
      <TagInput
        label="标签"
        value={tags}
        onChange={setTags}
        placeholder="输入标签后按回车添加"
      />

      {/* Definition */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">定义型内容 (DEF)</label>
        <p className="text-xs text-muted-foreground">
          简短的术语定义，用于 hover 预览。
        </p>
        <textarea
          {...form.register("definition")}
          rows={3}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-y"
          placeholder="输入简短定义..."
        />
      </div>

      {/* Human notes */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">博主笔记 (HUMAN)</label>
        <p className="text-xs text-muted-foreground">
          支持 Markdown 语法。
        </p>
        <textarea
          {...form.register("human")}
          rows={8}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary resize-y"
          placeholder="博主笔记内容，支持 Markdown..."
        />
      </div>

      {/* AI content */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">AI 补充 (AI)</label>
        <p className="text-xs text-muted-foreground">
          AI 生成的内容，阶段 3 为手动预留。
        </p>
        <textarea
          {...form.register("ai")}
          rows={6}
          className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 px-3 py-2 text-sm font-mono outline-none focus:border-primary resize-y"
          placeholder="阶段 3 预留，可手动填写..."
        />
      </div>

      {/* References */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">参考文献 (REF)</label>
        <p className="text-xs text-muted-foreground">
          参考来源列表。
        </p>
        <textarea
          {...form.register("ref")}
          rows={4}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary resize-y"
          placeholder="[1] 来源标题, 作者, 年份"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
          <Save className="size-4 mr-2" />
          保存更改
        </Button>

        {canReview && (
          <Button
            type="button"
            variant="default"
            disabled={reviewing}
            onClick={handleReview}
            className="bg-green-600 hover:bg-green-700"
          >
            {reviewing ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="size-4 mr-2" />
            )}
            审查通过
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/wiki")}
        >
          取消
        </Button>
      </div>
    </form>
  );
}

// --- Main Form (dispatches to CreateForm or EditForm) ---

export function WikiEntryForm({ mode, initialData }: WikiEntryFormProps) {
  if (mode === "create") {
    return <CreateForm />;
  }

  if (!initialData) {
    return <p className="text-sm text-muted-foreground">加载中...</p>;
  }

  return <EditForm initialData={initialData} />;
}
