/**
 * @file ChatDrawer — AI chat dialog with Miniese.
 *
 * Slides in from the right side. Supports multi-turn conversation.
 * When a text selection is provided, shows a selection card with
 * shortcut action buttons (explain, translate, example, summarize).
 * Selection context is sent to the API to enhance the system prompt.
 *
 * Uses SSE streaming to display AI responses incrementally.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  BookOpenText,
  Languages,
  Lightbulb,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderChatMarkdown } from "@/lib/markdown/client-render";
import type { SelectionInfo } from "@/types/ai";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatDrawerProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Called when the drawer should close */
  onClose: () => void;
  /** Text selection info (from article reading page) */
  selection?: SelectionInfo;
  /** Language for UI text */
  lang?: string;
}

/**
 * Pre-built quick action templates.
 * {{content}} is replaced with the selected text.
 */
const QUICK_ACTIONS = {
  explain: {
    zh: "请解释以上选中的内容：{{content}}",
    en: "Please explain the selected content: {{content}}",
    icon: BookOpenText,
    label_zh: "解释",
    label_en: "Explain",
  },
  translate: {
    zh: "请将以上选中的内容翻译为中文：{{content}}",
    en: "Please translate the selected content to Chinese: {{content}}",
    icon: Languages,
    label_zh: "翻译",
    label_en: "Translate",
  },
  example: {
    zh: "请为以上选中的概念举一个实际例子：{{content}}",
    en: "Please give a practical example of the selected concept: {{content}}",
    icon: Lightbulb,
    label_zh: "举例",
    label_en: "Example",
  },
  summarize: {
    zh: "请总结以上选中的内容：{{content}}",
    en: "Please summarize the selected content: {{content}}",
    icon: ScrollText,
    label_zh: "总结",
    label_en: "Summarize",
  },
} as const;

type QuickActionKey = keyof typeof QUICK_ACTIONS;

export function ChatDrawer({
  open,
  onClose,
  selection,
  lang = "zh",
}: ChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [renderedHtml, setRenderedHtml] = useState<Record<number, string>>({});
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionCollapsed, setSelectionCollapsed] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(384); // default max-w-md = 384px (24rem)
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragRef = useRef(false);

  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Reset error on close; keep messages history on reopen
  useEffect(() => {
    if (!open) {
      setError(null);
    }
  }, [open]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || streaming) return;

      const userMessage: ChatMessage = { role: "user", content };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInput("");
      setStreaming(true);
      setError(null);

      // Abort previous stream if any
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const body: Record<string, unknown> = {
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        };

        // Include selection context if present
        if (selection) {
          body.selection = {
            text: selection.text,
            surroundingContext: selection.surroundingContext,
            articleTitle: selection.articleTitle,
            articleExcerpt: selection.articleExcerpt,
            headingPath: selection.headingPath,
          };
        }

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `${t("请求失败", "Request failed")} (${res.status})`);
        }

        const assistantMessage: ChatMessage = { role: "assistant", content: "" };
        setMessages((prev) => [...prev, assistantMessage]);

        const reader = res.body?.getReader();
        if (!reader) throw new Error(t("无法读取响应流", "Cannot read response stream"));

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.content || "";
                if (delta) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === "assistant") {
                      if (last.content.endsWith(delta)) {
                        return updated;
                      }
                      last.content += delta;
                    }
                    return updated;
                  });
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || t("请求失败", "Request failed"));
      } finally {
        setStreaming(false);
        abortRef.current = null;

        // Render the last assistant message to Markdown HTML
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          const last = prev[lastIdx];
          if (last && last.role === "assistant" && last.content) {
            renderChatMarkdown(last.content).then((html) => {
              setRenderedHtml((prevHtml) => ({ ...prevHtml, [lastIdx]: html }));
            });
          }
          return prev;
        });
      }
    },
    [input, messages, streaming, selection, t],
  );

  const handleSend = useCallback(() => {
    sendMessage(input);
  }, [sendMessage, input]);

  const handleQuickAction = useCallback(
    (key: QuickActionKey) => {
      const action = QUICK_ACTIONS[key];

      if (key === "translate") {
        // Translate to the opposite language of the article
        const targetLang = lang === "zh" ? "English" : "中文";
        const prompt = lang === "zh"
          ? `请将以上选中的内容翻译为${targetLang}：{{content}}`
          : `Please translate the selected content to ${targetLang}: {{content}}`;
        const content = prompt.replace("{{content}}", selection?.text || "");
        sendMessage(content);
        return;
      }

      const template = lang === "zh" ? action.zh : action.en;
      const content = template.replace("{{content}}", selection?.text || "");
      sendMessage(content);
    },
    [sendMessage, selection, lang],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClear = () => {
    setShowClearConfirm(false);
    setMessages([]);
    setRenderedHtml({});
    setInput("");
    setError(null);
  };

  // Draggable width — attach/detach global mouse events
  const handleDragStart = useCallback(() => {
    dragRef.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      // Distance from right edge of viewport
      const newWidth = window.innerWidth - e.clientX;
      setDrawerWidth(Math.max(320, Math.min(700, newWidth)));
    };

    const handleMouseUp = () => {
      dragRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  if (!open) return null;

  return (
    <>
      {/* No overlay — drawer stays open until closed via X button or Escape key.
          This allows users to select article text while chatting. */}

      {/* Drawer — mobile: fullscreen, desktop: side panel */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full flex-col border-l border-border bg-background shadow-xl max-md:inset-0 max-md:w-full max-md:border-l-0"
        style={{ width: drawerWidth }}
      >
        {/* Drag handle — desktop only */}
        <div
          onMouseDown={handleDragStart}
          className="hidden md:block absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/50 transition-colors z-20"
          title={t("拖拽调整宽度", "Drag to resize")}
        />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 md:px-4">
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-primary shrink-0" />
            <span className="font-medium text-sm md:text-base">{t("向 Miniese 提问", "Ask Miniese")}</span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowClearConfirm(true)}
                className="text-xs text-muted-foreground max-md:px-2 max-md:h-8"
              >
                {t("清空历史", "Clear History")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-8 md:size-9"
              aria-label={t("关闭", "Close")}
            >
              <X className="size-4 md:size-5" />
            </Button>
          </div>
        </div>

        {/* Body — takes remaining space, scrolls as a whole */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Selection card + quick actions (sticky top inside scroll) */}
          {selection && (
            <div className="sticky top-0 z-10 bg-background border-b border-border/50">
              <div className="rounded-lg border border-primary/20 bg-primary/5 mx-4 my-3">
                <button
                  type="button"
                  onClick={() => setSelectionCollapsed(!selectionCollapsed)}
                  className="flex w-full items-center justify-between px-3 py-2.5 md:py-2 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                      {t("选中内容", "Selected")}
                    </span>
                    {selection.headingPath && (
                      <span className="text-[10px] text-muted-foreground/60 truncate" title={selection.headingPath}>
                        {selection.headingPath}
                      </span>
                    )}
                  </div>
                  <svg
                    className={`size-3 shrink-0 text-muted-foreground/40 transition-transform ${selectionCollapsed ? "" : "rotate-180"}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                {!selectionCollapsed && (
                  <div className="px-3 pb-3">
                    <p className="text-sm leading-relaxed text-foreground/80 line-clamp-4">
                      {selection.text}
                    </p>
                    {selection.text.length > 200 && (
                      <p className="text-[10px] text-muted-foreground/40 mt-1">
                        {t("完整内容已作为上下文发送", "Full content sent as context")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Quick action buttons — horizontal scroll on mobile */}
              <div className="flex items-center gap-1.5 px-4 pb-3 overflow-x-auto max-md:gap-2 max-md:px-3 max-md:pb-4 scrollbar-none">
                {(Object.keys(QUICK_ACTIONS) as QuickActionKey[]).map((key) => {
                  const action = QUICK_ACTIONS[key];
                  const Icon = action.icon;
                  const label = lang === "zh" ? action.label_zh : action.label_en;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleQuickAction(key)}
                      disabled={streaming}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 md:px-2.5 md:py-1.5 text-xs font-medium text-foreground hover:bg-accent hover:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      <Icon className="size-3.5 md:size-3 shrink-0 text-muted-foreground" />
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Divider */}
              <div className="relative px-4 pb-3">
                <div className="absolute inset-0 flex items-center px-4">
                  <span className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-[10px] text-muted-foreground/40">
                  <span className="bg-background px-2">
                    {t("或输入自定义问题", "or type your own question")}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Empty state (no selection, no messages) */}
          {messages.length === 0 && !selection && (
            <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground/60 px-6 md:px-4">
              <Bot className="size-12 md:size-12 mb-3 md:mb-3 opacity-30" />
              <p className="text-sm md:text-sm">
                {t("你好！我是 Miniese，可以问我关于文章的任何问题。", "Hi! I'm Miniese. Ask me anything about the article.")}
              </p>
            </div>
          )}

          {/* Chat messages */}
          {messages.length > 0 && (
            <div className="px-4 py-4 md:py-4 space-y-4 md:space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 md:gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="size-7 md:size-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="size-3.5 md:size-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-xl px-3 md:px-3 text-sm leading-relaxed break-words ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground py-2 max-w-[85%] md:max-w-[80%]"
                        : "bg-muted prose prose-sm dark:prose-invert max-w-[85%] md:max-w-[80%] max-w-none"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      renderedHtml[i] ? (
                        <div dangerouslySetInnerHTML={{ __html: renderedHtml[i] }} />
                      ) : msg.content ? (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      ) : streaming && i === messages.length - 1 ? (
                        <span className="inline-flex gap-1">
                          <span className="size-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="size-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="size-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                      ) : null
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="size-7 md:size-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
                      <User className="size-3.5 md:size-4 text-muted-foreground/60" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Clear confirmation */}
        {showClearConfirm && (
          <div className="mx-4 mb-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2.5 md:px-3 md:py-2 text-sm shadow-lg">
            <span className="text-muted-foreground text-xs md:text-sm leading-relaxed">
              {t("确定清空所有对话历史？此操作将让 Miniese 忘记本次对话，且不可撤销。", "Clear all conversation history? This will make Miniese forget this conversation, and it cannot be undone.")}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowClearConfirm(false)}
                className="text-xs h-8 md:h-7 flex-1 md:flex-none"
              >
                {t("取消", "Cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClear}
                className="text-xs h-8 md:h-7 flex-1 md:flex-none"
              >
                {t("清空", "Clear")}
              </Button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 md:px-3 md:py-2 text-xs md:text-xs text-destructive">
            <AlertCircle className="size-3.5 md:size-3 shrink-0" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border px-4 py-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selection ? t("补充你的问题...", "Ask a follow-up...") : t("输入你的问题...", "Ask a question...")}
              rows={2}
              disabled={streaming}
              className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5 md:py-2 text-sm md:text-sm ring-offset-background placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 max-md:min-h-[44px]"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="shrink-0 size-[42px] md:size-[42px] max-md:size-[48px]"
            >
              {streaming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground/40">
            {t("Shift+Enter 换行", "Shift+Enter for new line")}
          </p>
        </div>
      </div>
    </>
  );
}
