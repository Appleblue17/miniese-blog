/**
 * @file /admin/media — Media library page.
 *
 * Allows admin to browse, upload, create/rename/delete files and folders.
 * Uses a modal dialog (matching ArticleRowActions style) for delete confirmations.
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
  FolderPlus,
  Loader2,
  Check,
  ClipboardCopy,
  AlertCircle,
  AlertTriangle,
  X,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────

interface MediaFile {
  name: string;
  path: string;
  size: number;
  isImage: boolean;
  width?: number;
  height?: number;
}

interface MediaResponse {
  files: MediaFile[];
  directories: string[];
  currentDir: string;
}

// ─── Helpers ──────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDimensions(w?: number, h?: number): string {
  if (w && h) return `${w}×${h}`;
  return "";
}

// ─── Delete Confirm Modal ─────────────────────────

function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  loading,
  confirmLabel = "确认删除",
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  confirmLabel?: string;
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
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
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
            {loading ? "处理中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Rename Input Modal ───────────────────────────

function RenameModal({
  currentName,
  onConfirm,
  onCancel,
  loading,
  error,
}: {
  currentName: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [value, setValue] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && trimmed !== currentName) {
      onConfirm(trimmed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative mx-4 w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-primary/10 p-2">
            <PenLine className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">重命名</h3>
            <form onSubmit={handleSubmit} className="mt-3">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="输入新名称"
              />
              {error && (
                <p className="mt-1 text-xs text-destructive">{error}</p>
              )}
            </form>
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
            onClick={() => {
              const trimmed = value.trim();
              if (trimmed && trimmed !== currentName) onConfirm(trimmed);
            }}
            disabled={loading || !value.trim() || value.trim() === currentName}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "处理中..." : "确认"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Folder Modal ──────────────────────────

function CreateFolderModal({
  onConfirm,
  onCancel,
  loading,
  error,
}: {
  onConfirm: (name: string) => void;
  onCancel: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative mx-4 w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-primary/10 p-2">
            <FolderPlus className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">新建文件夹</h3>
            <form onSubmit={handleSubmit} className="mt-3">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="输入文件夹名称"
              />
              {error && (
                <p className="mt-1 text-xs text-destructive">{error}</p>
              )}
            </form>
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
            onClick={() => {
              const trimmed = value.trim();
              if (trimmed) onConfirm(trimmed);
            }}
            disabled={loading || !value.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────

export default function MediaPage() {
  const [currentDir, setCurrentDir] = useState("/images");
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modal states
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string; type: "文件" | "文件夹" } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Load directory ──────────────────────────────

  const loadDirectory = useCallback(async (dir: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/media?dir=${encodeURIComponent(dir)}`);
      if (!res.ok) throw new Error("Failed to load");
      const data: MediaResponse = await res.json();
      setFiles(data.files);
      setDirectories(data.directories);
      setCurrentDir(data.currentDir);
    } catch {
      setLoadError("加载失败，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory("/images");
  }, [loadDirectory]);

  // ─── Upload ──────────────────────────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus("idle");

    try {
      const formData = new FormData();
      formData.append("file", file);
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

  // ─── Delete ──────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/media?path=${encodeURIComponent(deleteTarget.path)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "删除失败");
      }
      setDeleteTarget(null);
      loadDirectory(currentDir);
    } catch {
      // Keep current state
    } finally {
      setDeleting(false);
    }
  };

  // ─── Rename ──────────────────────────────────────

  const handleRename = async (newName: string) => {
    if (!renameTarget) return;
    setRenaming(true);
    setRenameError(null);
    try {
      const res = await fetch("/api/admin/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: renameTarget.path, newName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRenameError(data.error || "重命名失败");
        setRenaming(false);
        return;
      }
      setRenameTarget(null);
      loadDirectory(currentDir);
    } catch {
      setRenameError("重命名请求失败");
      setRenaming(false);
    }
  };

  // ─── Create folder ───────────────────────────────

  const handleCreateFolder = async (name: string) => {
    setCreatingFolder(true);
    setCreateFolderError(null);
    try {
      const newDir = `${currentDir}/${name}`;
      const res = await fetch("/api/admin/media", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir: newDir }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateFolderError(data.error || "创建失败");
        setCreatingFolder(false);
        return;
      }
      setShowCreateFolder(false);
      loadDirectory(currentDir);
    } catch {
      setCreateFolderError("创建请求失败");
      setCreatingFolder(false);
    }
  };

  // ─── Copy path ───────────────────────────────────

  const handleCopyPath = (filePath: string) => {
    navigator.clipboard.writeText(filePath).catch(() => {});
  };

  // ─── Render ──────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* ─── Page header ─────────────────────────────── */}
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
          <Button
            variant="outline"
            onClick={() => setShowCreateFolder(true)}
          >
            <FolderPlus className="size-4" />
            新建文件夹
          </Button>
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

      {/* ─── Breadcrumb ──────────────────────────────── */}
      <div className="flex items-center gap-1 mb-6 text-sm">
        {(() => {
          const segments = currentDir.split("/").filter(Boolean);
          return segments.map((part, idx) => {
            const targetDir = "/" + segments.slice(0, idx + 1).join("/");
            const isCurrent = idx === segments.length - 1;
            return (
              <div key={targetDir} className="flex items-center gap-1">
                {idx > 0 && (
                  <span className="text-muted-foreground select-none">/</span>
                )}
                {isCurrent ? (
                  <span className="px-2 py-1 rounded-md bg-primary/15 text-primary font-medium">
                    {part}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => loadDirectory(targetDir)}
                    className="px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    {part}
                  </button>
                )}
              </div>
            );
          });
        })()}
        <span className="text-xs text-muted-foreground ml-auto">
          {files.length} 个文件
          {directories.length > 0 && ` · ${directories.length} 个子目录`}
        </span>
      </div>

      {/* ─── Loading ─────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ─── Directory listing ───────────────────────── */}
      {!loading && (
        <div className="space-y-2">
          {/* Parent directory button */}
          {currentDir !== "/images" && (
            <button
              type="button"
              onClick={() => {
                const parent = currentDir.substring(0, currentDir.lastIndexOf("/"));
                loadDirectory(parent || "/images");
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mb-2"
            >
              <ArrowLeft className="size-4" />
              返回上一级
            </button>
          )}

          {/* Subdirectories */}
          {directories.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 mb-8">
              {directories.map((dir) => {
                const dirName = dir.split("/").pop() || dir;
                return (
                  <div
                    key={dir}
                    className="card-base group relative rounded-xl border border-border bg-card overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => loadDirectory(dir)}
                      className="flex flex-col items-center gap-3 py-8 w-full hover:bg-muted transition-colors"
                    >
                      <FolderIcon className="size-14 text-primary/60" />
                      <span className="text-sm text-center text-muted-foreground truncate w-full px-2">
                        {dirName}
                      </span>
                    </button>

                    {/* Folder actions overlay — clicking enters the directory */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => loadDirectory(dir)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") loadDirectory(dir);
                      }}
                      className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameTarget({ path: dir, name: dirName });
                        }}
                        className="rounded-lg bg-foreground/80 px-2.5 py-1.5 text-xs font-medium text-background hover:bg-foreground transition-colors"
                        title="重命名"
                      >
                        <PenLine className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ path: dir, name: dirName, type: "文件夹" });
                        }}
                        className="rounded-lg bg-red-500/90 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-600 transition-colors"
                        title="删除文件夹"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Error state */}
          {loadError && (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <AlertCircle className="size-16 mb-4 text-destructive opacity-50" />
              <p className="text-lg font-medium mb-1 text-destructive">加载失败</p>
              <p className="text-sm mb-4">{loadError}</p>
              <Button
                variant="outline"
                onClick={() => loadDirectory(currentDir)}
              >
                重试
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!loadError && files.length === 0 && directories.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <ImageIcon className="size-16 mb-4 opacity-30" />
              <p className="text-lg font-medium mb-1">暂无文件</p>
              <p className="text-sm">点击右上角按钮上传图片或新建文件夹</p>
            </div>
          )}

          {/* File grid */}
          {files.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {files.map((file) => (
                <div
                  key={file.path}
                  className="card-base group relative rounded-xl border border-border bg-card overflow-hidden"
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
                    <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <span>{formatSize(file.size)}</span>
                      {file.isImage && file.width && file.height && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span>{formatDimensions(file.width, file.height)}</span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Actions overlay */}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={file.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-foreground/80 p-2 text-background hover:bg-foreground transition-colors"
                      title="在新标签页中打开"
                    >
                      <ImageIcon className="size-4" />
                    </a>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyPath(file.path);
                      }}
                      className="rounded-lg bg-foreground/80 p-2 text-background hover:bg-foreground transition-colors"
                      title="复制路径"
                    >
                      <ClipboardCopy className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameTarget({ path: file.path, name: file.name });
                      }}
                      className="rounded-lg bg-foreground/80 p-2 text-background hover:bg-foreground transition-colors"
                      title="重命名"
                    >
                      <PenLine className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ path: file.path, name: file.name, type: "文件" });
                      }}
                      className="rounded-lg bg-red-500/90 p-2 text-white hover:bg-red-600 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Modals ──────────────────────────────────── */}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <ConfirmModal
          title={`确认删除${deleteTarget.type}`}
          message={
            <>
              确定要删除 <strong className="text-foreground">{deleteTarget.name}</strong>
              {deleteTarget.type === "文件夹" ? " 及其所有内容" : ""} 吗？
              <br />
              此操作不可撤销。
            </>
          }
          onConfirm={handleDelete}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          loading={deleting}
        />
      )}

      {/* Rename modal */}
      {renameTarget && (
        <RenameModal
          currentName={renameTarget.name}
          onConfirm={handleRename}
          onCancel={() => {
            if (!renaming) {
              setRenameTarget(null);
              setRenameError(null);
            }
          }}
          loading={renaming}
          error={renameError}
        />
      )}

      {/* Create folder modal */}
      {showCreateFolder && (
        <CreateFolderModal
          onConfirm={handleCreateFolder}
          onCancel={() => {
            if (!creatingFolder) {
              setShowCreateFolder(false);
              setCreateFolderError(null);
            }
          }}
          loading={creatingFolder}
          error={createFolderError}
        />
      )}
    </div>
  );
}
