/**
 * @file ImageManager — Image management component for the draft editor.
 *
 * Provides:
 * - Upload area (drag & drop or click to select)
 * - List of uploaded images with thumbnails
 * - Delete button per image
 * - Copy Markdown reference to clipboard
 *
 * Props:
 *   articleId: string — The draft or article ID
 *   isDraft: boolean — Whether the article is a draft
 *
 * Usage:
 *   <ImageManager articleId={draftId} isDraft={true} />
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload,
  Image as ImageIcon,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  X,
  FileImage,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ImageInfo {
  filename: string;
  size: number;
}

interface ImageManagerProps {
  articleId: string;
  isDraft?: boolean;
}

export function ImageManager({ articleId, isDraft = true }: ImageManagerProps) {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load images on mount
  useEffect(() => {
    loadImages();
  }, [articleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadImages = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/articles/images/${articleId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load images");
      }
      const data = await res.json();
      setImages(data.images || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load images");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("Only image files are supported.");
        return;
      }

      setUploading(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`/api/articles/images/${articleId}`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }

        // Reload the image list
        await loadImages();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [articleId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleDelete = useCallback(
    async (filename: string) => {
      if (!confirm(`确定要删除 "${filename}"？此操作不可撤销。`)) return;

      setError(null);
      try {
        const res = await fetch(
          `/api/articles/images/${articleId}?filename=${encodeURIComponent(filename)}`,
          { method: "DELETE" },
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Delete failed");
        }

        setImages((prev) => prev.filter((img) => img.filename !== filename));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [articleId],
  );

  const handleCopyMarkdown = useCallback(
    (filename: string, index: number) => {
      const imageUrl = `/api/images/${articleId}/${encodeURIComponent(filename)}`;
      const markdown = `![${filename}](${imageUrl})`;

      navigator.clipboard.writeText(markdown).then(
        () => {
          setCopiedIndex(index);
          setTimeout(() => setCopiedIndex(null), 2000);
        },
        () => {
          // Fallback for older browsers
          const textarea = document.createElement("textarea");
          textarea.value = markdown;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
          setCopiedIndex(index);
          setTimeout(() => setCopiedIndex(null), 2000);
        },
      );
    },
    [articleId],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [handleUpload],
  );

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`
          flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl
          border-2 border-dashed p-6 text-center transition-colors
          ${isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"}
          ${uploading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        {uploading ? (
          <>
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">正在上传...</p>
          </>
        ) : (
          <>
            <Upload className="size-6 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">拖拽图片到此处，或点击选择</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                支持 JPG, PNG, GIF, WebP, SVG, AVIF（最大 10MB）
              </p>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/avif"
          className="hidden"
          onChange={handleInputChange}
          disabled={uploading}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto p-0.5 hover:opacity-70"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Image list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">
            {loading ? "加载中..." : `已上传图片 (${images.length})`}
          </h4>
          {!loading && images.length > 0 && (
            <button
              type="button"
              onClick={loadImages}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              刷新
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
            <ImageIcon className="size-8 mb-2 opacity-40" />
            <p>暂无图片</p>
            <p className="text-xs mt-1">上传图片后，可以复制 Markdown 引用到文章中</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.map((img, index) => {
              const imageUrl = `/api/images/${articleId}/${encodeURIComponent(img.filename)}`;
              return (
                <div
                  key={img.filename}
                  className="group relative rounded-lg border border-border overflow-hidden bg-muted/20"
                >
                  {/* Thumbnail */}
                  <div className="aspect-square flex items-center justify-center bg-muted/10 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt={img.filename}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  {/* File info */}
                  <div className="p-2">
                    <p className="text-xs truncate" title={img.filename}>
                      {img.filename}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatSize(img.size)}
                    </p>
                  </div>

                  {/* Action overlay on hover */}
                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleCopyMarkdown(img.filename, index)}
                      className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-100 transition-colors shadow-sm"
                      title="复制 Markdown 引用"
                    >
                      {copiedIndex === index ? (
                        <Check className="size-3.5 text-green-600" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copiedIndex === index ? "已复制" : "引用"}
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open(imageUrl, "_blank")}
                      className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-100 transition-colors shadow-sm"
                      title="在新标签页中查看"
                    >
                      <ExternalLink className="size-3.5" />
                      查看
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(img.filename)}
                      className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-gray-100 transition-colors shadow-sm"
                      title="删除图片"
                    >
                      <Trash2 className="size-3.5" />
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
