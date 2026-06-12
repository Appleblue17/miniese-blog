/**
 * @file Review prompt template for AI article review.
 *
 * The prompt asks the AI to review article content and return
 * a structured JSON report with three sections:
 * - factual: Factual errors
 * - typo: Spelling and grammar
 * - clarity: Ambiguity and fluency issues
 * - other: Other suggestions
 *
 * The severity field is placed at the end of each item so the AI
 * makes its judgment after fully reasoning through the analysis.
 * A "ok" severity indicates an item that was investigated but
 * deemed correct (helpful for transparency).
 */

/**
 * The review prompt template.
 * Use `{{content}}` as a placeholder for the article chunk content.
 *
 * When using with context markers, `[REVIEW_START]` and `[REVIEW_END]`
 * delimit the target content to review; text outside these markers is
 * context for reference only. Line numbers in the JSON output refer to
 * positions within the `[REVIEW_START]..[REVIEW_END]` block.
 */
export const REVIEW_PROMPT = `你是一位专业的技术编辑，请对以下文章内容进行审查。

## 注意事项（重要）
1. 本文可能使用自定义语法结构，不需要审查，请专注于内容的文字表达。
2. 本文可能是长篇技术文章的一个片段（段落级），因此"结构与可读性"层面的整体评价不在本审查范围内。
3. 在写下所有分析（定位、摘录、问题描述、修改建议）之后，再对其做最终判定（severity）。不要在分析中途下结论。

## 输出格式要求
请返回严格的 JSON 格式，结构如下：

{
  "sections": [
    {
      "type": "factual",
      "title": "事实性错误",
      "items": [
        {
          "lineStart": 5,
          "lineEnd": 7,
          "snippet": "原文摘录...",
          "issue": "问题描述",
          "suggestion": "修改建议",
          "severity": "error"
        }
      ]
    },
    {
      "type": "typo",
      "title": "拼写与语法",
      "items": [...]
    },
    {
      "type": "clarity",
      "title": "表达歧义与通顺性",
      "items": [...]
    },
    {
      "type": "other",
      "title": "其他建议",
      "items": [...]
    }
  ]
}

## 字段说明
- lineStart / lineEnd: 问题在目标内容中的起止行号（1-based，相对于 [REVIEW_START]..[REVIEW_END] 块内的行号）。如果整段都有问题，填行号范围即可
- snippet: 原文中的相关片段，用于定位
- issue: 问题描述，清晰说明具体哪里有问题
- suggestion: 修改建议
- severity: **放在最后填写**，可选值：
  - "error": 明确的错误（事实错误、语法错误等），需要修改
  - "warning": 可能有问题或值得商榷的表达，建议关注
  - "suggestion": 非必要的优化建议，不改也可
  - "ok": 经过检查后认为没有问题（保留此条用于展示检查过程）
- 如果某个板块没有问题，返回空数组，不要返回含 "ok" 条目的数组

## 文章内容
{{content}}`;

/**
 * Fills the review prompt with the actual article content.
 *
 * @param content - The article chunk content to review.
 * @returns The filled prompt string.
 */
export function buildReviewPrompt(content: string): string {
  return REVIEW_PROMPT.replace("{{content}}", content);
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
 * @returns The filled prompt string
 */
export function buildReviewPromptWithContext(contextText: string, targetText: string): string {
  const combined: string[] = [];

  if (contextText.trim()) {
    combined.push(contextText);
    combined.push("");
  }

  combined.push("[REVIEW_START]");
  combined.push(targetText);
  combined.push("[REVIEW_END]");

  return REVIEW_PROMPT.replace("{{content}}", combined.join("\n"));
}
