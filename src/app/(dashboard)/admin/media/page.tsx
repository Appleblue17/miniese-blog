/**
 * @file /admin/media — Media library page.
 *
 * Allows admin to browse, upload, and delete files in public/images/.
 * Files are displayed in a grid with thumbnails for images.
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  Trash2,
  ImageIcon,
  FileIcon,
  FolderIcon,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaFile {
  name: string;
  path: string;
  size: number;
  isImage: boolean;
}

interface MediaResponse {
  files: MediaFile[];
  directories: string[];
  currentDir: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const iconMap: Record<string, string> = {
    png: "image",
    jpg: "image",
    jpeg: "image",
    gif: "image",
    webp: "image",
    svg: "image",
    ico: "image",
    bmp: "image",
    pdf: "file",
    zip: "file",
    tar: "file",
    gz: "file",
  };
  return iconMap[ext] || "file";
}

export default function MediaPage() {
  const [currentDir, setCurrentDir] = useState("/images");
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDirectory = useCallback(async (dir: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/media?dir=${encodeURIComponent(dir)}`);
      if (!res.ok) throw new Error("Failed to load");
      const data: MediaResponse = await res.json();
      setFiles(data.files);
      setDirectories(data.directories);
      setCurrentDir(data.currentDir);
    } catch {
      // Keep current state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory("/images");
  }, [loadDirectory]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus("idle");

    try {
      const formData = new FormData();
      formData.append("file", file);
      // Upload to the "images" subdirectory matching current dir, stripping /images/ prefix
      const uploadDir = currentDir.startsWith("/images") ? currentDir : "/images";
      formData.append("dir", uploadDir);

      const res = await fetch("/api/admin/media", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      setUploadStatus("success");
      setTimeout(() => setUploadStatus("idle"), 2000);
      loadDirectory(currentDir);
    } catch {
      setUploadStatus("error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (filePath: string) => {
    try {
      const res = await fetch(`/api/admin/media?path=${encodeURIComponent(filePath)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setDeleteConfirm(null);
      loadDirectory(currentDir);
    } catch {
      // Keep current state
    }
  };

  const handleCopyPath = (filePath: string) => {
    navigator.clipboard.writeText(filePath).catch(() => {
      // Fallback
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="inline-flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">媒体库</h1>
        </div>
        <div className="flex items-center gap-3">
          {uploadStatus === "success" && (
            <span className="inline-flex items-center gap-1 text-sm text-green-600">
              <Check className="size-4" /> 上传成功
            </span>
          )}
          {uploadStatus === "error" && (
            <span className="inline-flex items-center gap-1 text-sm text-destructive">
              <AlertCircle className="size-4" /> 上传失败
            </span>
          )}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
              id="file-upload"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              上传图片
            </Button>
          </div>
        </div>
      </div>

      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <button
          type="button"
          onClick={() => loadDirectory("/images")}
          className={`px-3 py-1 rounded-md transition-colors ${
            currentDir === "/images"
              ? "bg-primary/15 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          /images
        </button>
        {currentDir !== "/images" && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">
              {currentDir.replace("/images/", "")}
            </span>
          </>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {files.length} 个文件
          {directories.length > 0 && ` · ${directories.length} 个子目录`}
        </span>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Directory listing */}
      {!loading && (
        <div className="space-y-2">
          {/* Subdirectories */}
          {directories.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
              {directories.map((dir) => {
                const dirName = dir.split("/").pop() || dir;
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => loadDirectory(dir)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 hover:bg-muted transition-colors"
                  >
                    <FolderIcon className="size-10 text-primary/60" />
                    <span className="text-xs text-center text-muted-foreground truncate w-full">
                      {dirName}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {files.length === 0 && directories.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <ImageIcon className="size-16 mb-4 opacity-30" />
              <p className="text-lg font-medium mb-1">暂无文件</p>
              <p className="text-sm">点击右上角"上传图片"按钮添加文件</p>
            </div>
          )}

          {/* File grid */}
          {files.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {files.map((file) => (
                <div
                  key={file.path}
                  className="group relative rounded-xl border border-border bg-card overflow-hidden"
                >
                  {/* Thumbnail / Icon */}
                  <div className="aspect-[4/3] flex items-center justify-center bg-muted/30 overflow-hidden">
                    {file.isImage ? (
                      <img
                        src={file.path}
                        alt={file.name}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <FileIcon className="size-12 text-muted-foreground opacity-40" />
                    )}
                  </div>

                  {/* File info */}
                  <div className="p-2.5">
                    <p className="text-xs font-medium truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatSize(file.size)}
                    </p>
                  </div>

                  {/* Actions overlay */}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleCopyPath(file.path)}
                      className="rounded-lg bg-foreground/80 px-2.5 py-1.5 text-xs font-medium text-background hover:bg-foreground transition-colors"
                      title="复制路径"
                    >
                      复制路径
                    </button>
                    {deleteConfirm === file.path ? (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(file.path)}
                          className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-600 transition-colors"
                        >
                          确认
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(null)}
                          className="rounded-lg bg-foreground/80 px-2.5 py-1.5 text-xs font-medium text-background hover:bg-foreground transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(file.path)}
                        className="rounded-lg bg-red-500/90 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-600 transition-colors"
                        title="删除"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
