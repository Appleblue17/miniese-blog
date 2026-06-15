/**
 * Information about selected text in an article, sent to chat API for context.
 */
export interface SelectionInfo {
  /** The exact selected text */
  text: string;
  /** Surrounding context (e.g., paragraphs before and after the selection) */
  surroundingContext: string;
  /** Article title */
  articleTitle: string;
  /** Article excerpt/summary, if any */
  articleExcerpt?: string;
  /** Heading path, e.g. "Introduction > Getting Started > Installation" */
  headingPath: string;
}

export type AiTaskType = "review" | "translate" | "generate" | "scan" | "discover";
export type AiTaskStatus = "pending" | "processing" | "completed" | "failed";

export interface AiTaskMeta {
  id: string;
  type: AiTaskType;
  status: AiTaskStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * Result from AI term generation.
 */
export interface GenerateResult {
  terms: Array<{
    name: string;
    definition: string;
    tags: string[];
    aliases: string[];
  }>;
}

export interface ReviewReport {
  sections: {
    type: "factual" | "typo" | "clarity" | "other";
    title: string;
    items: {
      severity: "error" | "warning" | "suggestion" | "ok";
      lineStart: number;
      lineEnd: number;
      snippet: string;
      issue: string;
      suggestion: string;
    }[];
  }[];
}
