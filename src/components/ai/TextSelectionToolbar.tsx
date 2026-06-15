/**
 * @file TextSelectionToolbar — Floating toolbar when text is selected.
 *
 * Appears above selected text with two buttons:
 * - "向 Miniese 提问": Opens ChatDrawer with selected text and context pre-filled
 * - "申请添加词条": Submits a wiki term proposal with selected text as context
 *
 * Must be used within a client component that has text content.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, BookPlus, Loader2, Check } from "lucide-react";

interface TextSelectionToolbarProps {
  /** Language for UI text */
  lang?: string;
  /** Current article ID (for proposals) */
  articleId?: string;
  /** Called when user wants to ask Miniese about selected text */
  onAskQuestion: (text: string, range?: Range) => void;
}

export function TextSelectionToolbar({
  lang = "zh",
  articleId,
  onAskQuestion,
}: TextSelectionToolbarProps) {
  const [selectedText, setSelectedText] = useState("");
  const [selectedRange, setSelectedRange] = useState<Range | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [proposing, setProposing] = useState(false);
  const [proposeDone, setProposeDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);

  /**
   * Extract text from a Range, replacing KaTeX formulas with their LaTeX source.
   *
   * Uses range.cloneContents() to get a DOM fragment of the selection,
   * then walks it to replace .katex elements with their annotation LaTeX.
   * This avoids issues with duplicated nodes or partial text offsets.
   */
  const extractTextFromRange = useCallback((range: Range): string => {
    const fragment = range.cloneContents();
    if (!fragment) return "";

    // Replace .katex elements with their LaTeX source
    const katexEls = fragment.querySelectorAll(".katex");
    for (const el of katexEls) {
      const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
      const latex = annotation?.textContent?.trim();
      if (latex) {
        const displayMode = el.closest(".katex-display") !== null;
        const replacement = displayMode ? `$$${latex}$$` : `$${latex}$`;
        el.replaceWith(document.createTextNode(replacement));
      }
    }

    return fragment.textContent ?? "";
  }, []);

  // Track selection changes
  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();

    // Clear if nothing selected
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      // Delay hiding so the toolbar doesn't disappear before click registers
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = setTimeout(() => {
        setSelectedText("");
        setSelectedRange(null);
        setPosition(null);
        setError(null);
      }, 200);
      return;
    }

    const range = selection.getRangeAt(0);

    // Check if selection contains any KaTeX formulas
    const hasKatex =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE &&
      (range.commonAncestorContainer as Element).querySelector?.(".katex");

    const text = hasKatex ? extractTextFromRange(range).trim() : selection.toString().trim();
    if (text.length > 500) return; // Too long, don't show toolbar

    // Cancel hide timeout if selection is back
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    const rect = range.getBoundingClientRect();

    setSelectedText(text);
    setSelectedRange(range);
    setPosition({
      top: rect.top + window.scrollY - 8,
      left: rect.left + rect.width / 2,
    });
    setProposeDone(false);
    setError(null);
  }, [extractTextFromRange]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [handleSelectionChange]);

      // Close when pressing Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedText("");
        setSelectedRange(null);
        setPosition(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleAskQuestion = () => {
    if (!selectedText) return;
    onAskQuestion(selectedText, selectedRange ?? undefined);
    // Clear selection
    window.getSelection()?.removeAllRanges();
    setSelectedText("");
    setSelectedRange(null);
    setPosition(null);
  };

  const handleProposeTerm = async () => {
    if (!selectedText) return;
    setProposing(true);
    setError(null);

    try {
      const res = await fetch("/api/wiki/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedText.slice(0, 60), // Use selected text as name (truncated)
          sourceArticleId: articleId || undefined,
          sourceContext: selectedText,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          // Redirect to login
          window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        throw new Error(data.error || "提交失败");
      }

      setProposeDone(true);
      setTimeout(() => {
        window.getSelection()?.removeAllRanges();
        setSelectedText("");
        setPosition(null);
        setProposeDone(false);
      }, 1500);
    } catch (err) {
      setError((err as Error).message || "提交失败");
    } finally {
      setProposing(false);
    }
  };

  if (!position || !selectedText) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-lg border border-border bg-background px-1.5 py-1 shadow-lg"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onMouseDown={(e) => e.preventDefault()} // Prevent blur
    >
      <button
        onClick={handleAskQuestion}
        className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer whitespace-nowrap min-h-[36px]"
      >
        <Bot className="size-3.5" />
        {t("向 Miniese 提问", "Ask Miniese")}
      </button>

      <div className="h-5 w-px bg-border" />

      <button
        onClick={handleProposeTerm}
        disabled={proposing || proposeDone}
        className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap min-h-[36px]"
      >
        {proposeDone ? (
          <Check className="size-3.5 text-green-500" />
        ) : proposing ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <BookPlus className="size-3.5" />
        )}
        {proposeDone
          ? t("已提交", "Submitted")
          : t("申请添加词条", "Suggest term")}
      </button>

      {/* Error tooltip */}
      {error && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 rounded-md bg-destructive px-2.5 py-1 text-[10px] text-destructive-foreground whitespace-nowrap shadow">
          {error}
        </div>
      )}
    </div>
  );
}
