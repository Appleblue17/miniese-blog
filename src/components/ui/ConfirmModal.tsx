/**
 * @file ConfirmModal — A reusable confirmation dialog component.
 *
 * Features:
 * - Centered modal with backdrop
 * - Custom title, message, confirm/cancel text
 * - Loading state support
 * - Accessible keyboard navigation (Escape to cancel)
 */

"use client";

import { useEffect, useCallback } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

interface ConfirmModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Modal title */
  title: string;
  /** Modal message (supports JSX) */
  message: React.ReactNode;
  /** Label for the confirm button (default: "确认") */
  confirmLabel?: string;
  /** Label for the cancel button (default: "取消") */
  cancelLabel?: string;
  /** Variant of the confirm button */
  confirmVariant?: "default" | "destructive" | "warning";
  /** Whether the confirm action is loading */
  loading?: boolean;
  /** Called when user confirms */
  onConfirm: () => void;
  /** Called when user cancels or closes */
  onCancel: () => void;
}

const variantStyles: Record<string, string> = {
  default:
    "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  warning:
    "bg-amber-600 text-white hover:bg-amber-700",
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  confirmVariant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onCancel();
      }
    },
    [onCancel, loading],
  );

  useEffect(() => {
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={loading ? undefined : onCancel} />
      {/* Modal card */}
      <div className="relative mx-4 w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div
            className={`rounded-full p-2 ${
              confirmVariant === "destructive"
                ? "bg-destructive/10"
                : confirmVariant === "warning"
                  ? "bg-amber-100 dark:bg-amber-900/30"
                  : "bg-primary/10"
            }`}
          >
            <AlertTriangle
              className={`size-5 ${
                confirmVariant === "destructive"
                  ? "text-destructive"
                  : confirmVariant === "warning"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-primary"
              }`}
            />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold">{title}</h3>
            <div className="mt-1 text-sm text-muted-foreground">{message}</div>
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
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${variantStyles[confirmVariant]}`}
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? `${confirmLabel}中...` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
