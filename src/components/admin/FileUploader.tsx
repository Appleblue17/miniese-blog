"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface UploadResult {
  fileName: string;
  fileContent: string;
  language: string;
}

interface FileUploaderProps {
  onUpload: (result: UploadResult) => void;
}

const ACCEPTED_EXTENSIONS = [".md"];

export function FileUploader({ onUpload }: FileUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `仅支持 ${ACCEPTED_EXTENSIONS.join(", ")} 格式文件`;
    }
    if (file.size === 0) {
      return "文件为空";
    }
    return null;
  };

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        // Parse language from frontmatter (simple regex) — full parse via API later
        const langMatch = content.match(/^---\s*\n[\s\S]*?\nlanguage:\s*(zh|en)/m);
        const language = langMatch?.[1] || "zh";
        onUpload({ fileName: file.name, fileContent: content, language });
      };
      reader.readAsText(file);
    },
    [onUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">上传 Markdown 文件</h3>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        className={`
          flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl
          border-2 border-dashed p-8 text-center transition-colors
          ${isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"}
        `}
      >
        <Upload className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">
            拖拽文件到此处，或点击选择文件
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            仅支持 {ACCEPTED_EXTENSIONS.join(", ")} 格式
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".md"
          className="hidden"
          onChange={handleInputChange}
        />
        <Button type="button" variant="outline" size="sm">
          <FileText className="size-4" />
          选择文件
        </Button>
      </div>

      {/* Uploaded file info */}
      {fileName && !error && (
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary" className="gap-1">
            <FileText className="size-3" />
            {fileName}
          </Badge>
          <span className="text-xs text-green-600 dark:text-green-400">✓ 已上传</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4" />
          {error}
        </div>
      )}
    </div>
  );
}
