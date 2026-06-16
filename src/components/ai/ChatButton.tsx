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
      className="fixed bottom-6 right-6 md:bottom-6 md:right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-30 flex size-12 md:size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg hover:opacity-90 active:scale-95 transition-all cursor-pointer"
      aria-label="向 Miniese 提问"
      title="向 Miniese 提问"
    >
      <Bot className="size-5 md:size-6" />
    </button>
  );
}

