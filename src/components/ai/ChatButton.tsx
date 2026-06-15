/**
 * @file ChatButton — Floating AI chat button in the bottom-right corner.
 *
 * Clicking opens the ChatDrawer.
 */

"use client";

import { Bot } from "lucide-react";

interface ChatButtonProps {
  /** Called when the button is clicked */
  onClick: () => void;
}

export function ChatButton({ onClick }: ChatButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-30 flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg hover:opacity-90 active:scale-95 transition-all cursor-pointer"
      aria-label="向 Miniese 提问"
      title="向 Miniese 提问"
    >
      <Bot className="size-6" />
    </button>
  );
}
