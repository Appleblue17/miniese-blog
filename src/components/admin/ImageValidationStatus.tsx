/**
 * @file ImageValidationStatus — Validates image references in a draft article
 * and displays the verification status.
 *
 * Automatically checks that all images referenced in the Markdown content
 * exist in the article's images/ directory.
 *
 * Usage:
 *   <ImageValidationStatus articleId={draftId} content={markdownContent} />
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface ImageValidationStatusProps {
  articleId: string;
  content: string;
}

interface ValidationResult {
  valid: boolean;
  referenced: string[];
  missing: string[];
}

export function ImageValidationStatus({
  articleId,
  content,
}: ImageValidationStatusProps) {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(async () => {
    if (!content.trim()) {
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/articles/images/${articleId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "验证失败");
      }
      const data: ValidationResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证请求失败");
    } finally {
      setLoading(false);
    }
  }, [articleId, content]);

  // Auto-validate on mount and when content changes
  useEffect(() => {
    validate();
  }, [validate]);

  // No images referenced
  if (!result || result.referenced.length === 0) {
    return null;
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        验证图片引用...
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-destructive">
        <AlertTriangle className="size-3" />
        {error}
        <button
          type="button"
          onClick={validate}
          className="ml-1 underline hover:no-underline"
        >
          重试
        </button>
      </div>
    );
  }

  // All good
  if (result.valid) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <CheckCircle2 className="size-3" />
        {result.referenced.length} 张图片引用完整
      </div>
    );
  }

  // Missing images
  const MAX_VISIBLE = 3;
  const visibleNames = result.missing.slice(0, MAX_VISIBLE);
  const remainingCount = result.missing.length - MAX_VISIBLE;

  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
      <AlertTriangle className="size-3 shrink-0" />
      <span className="flex items-center gap-1 flex-wrap">
        缺少 {result.missing.length} 张图片：
        {visibleNames.map((name, i) => (
          <span key={name}>
            {i > 0 && "、"}
            <code className="text-[10px] bg-amber-100 dark:bg-amber-900/30 px-1 rounded">
              {name}
            </code>
          </span>
        ))}
        {remainingCount > 0 && (
          <span className="relative group">
            <span className="cursor-help underline decoration-dotted">
              等 {result.missing.length} 张
            </span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50">
              <div className="bg-popover text-popover-foreground rounded-lg border shadow-lg px-3 py-2 text-xs whitespace-nowrap max-w-64">
                <div className="font-medium mb-1">缺少的图片：</div>
                {result.missing.map((name) => (
                  <div key={name} className="font-mono">
                    {name}
                  </div>
                ))}
              </div>
            </div>
          </span>
        )}
        ，请上传后再发布
      </span>
      <button
        type="button"
        onClick={validate}
        className="ml-auto p-0.5 hover:opacity-70 shrink-0"
        title="重新验证"
      >
        <RefreshCw className="size-3" />
      </button>
    </div>
  );
}
