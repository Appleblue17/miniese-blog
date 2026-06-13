/**
 * @file Review prompt helpers.
 *
 * No hardcoded default content — prompts are loaded from site settings
 * (default-settings.json). Placeholder reference:
 * - {{content}} — the article content to review
 *
 * Use `[REVIEW_START]` and `[REVIEW_END]` markers to delimit the target
 * content; text outside these markers is context for reference only.
 * Line numbers in the JSON output refer to positions within the
 * `[REVIEW_START]..[REVIEW_END]` block.
 */

/**
 * Fills a review prompt template with the actual article content.
 *
 * @param content - The article chunk content to review.
 * @param prompt - The prompt template (from settings), must contain `{{content}}`.
 *                 If not provided, a minimal fallback is used (for tests).
 * @returns The filled prompt string.
 */
export function buildReviewPrompt(content: string, prompt?: string): string {
  const template = prompt || "Review the following content:\n\n{{content}}";
  return template.replace("{{content}}", content);
}

/**
 * Builds a review prompt with context window support.
 *
 * Uses `[REVIEW_START]/[REVIEW_END]` markers to delimit the target content.
 * Text outside the markers is provided as context (reference only, not modified).
 * Line numbers in the JSON output refer to positions within the markers.
 *
 * @param contextText - Surrounding context text (outside the markers)
 * @param targetText - The target content to review (inside the markers)
 * @param prompt - The prompt template (from settings), must contain `{{content}}`.
 *                 If not provided, a minimal fallback is used (for tests).
 * @returns The filled prompt string
 */
export function buildReviewPromptWithContext(
  contextText: string,
  targetText: string,
  prompt?: string,
): string {
  const template = prompt || "Review the following content:\n\n{{content}}";

  const combined: string[] = [];

  if (contextText.trim()) {
    combined.push(contextText);
    combined.push("");
  }

  combined.push("[REVIEW_START]");
  combined.push(targetText);
  combined.push("[REVIEW_END]");

  return template.replace("{{content}}", combined.join("\n"));
}
