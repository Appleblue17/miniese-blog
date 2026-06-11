export type AiTaskType = "review" | "translate" | "generate" | "scan";
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
