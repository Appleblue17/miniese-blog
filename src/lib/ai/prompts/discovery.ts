/**
 * @file AI wiki term discovery prompt template.
 *
 * Instructs DeepSeek to scan article content and identify terms that
 * would benefit from having a wiki entry. Returns structured JSON.
 */

/**
 * Builds the system prompt for term discovery.
 *
 * @returns The system prompt string.
 */
export function buildDiscoverySystemPrompt(): string {
  return `You are a technical documentation analysis expert. Please scan the following article content and extract terms that are worth adding as knowledge base entries.

## Types of terms worth adding
- Abbreviations (both Chinese and English): API, 中科院, PPO
- Technical terms/concepts: 闭包, 依赖注入, 函数式编程
- Theorems/formulas: 勾股定理, 贝叶斯定理, NP完全
- Tech stacks/tools: TypeScript, Docker, PostgreSQL
- Other nouns that need explanation: RFC 2616, OAuth 2.0

## Types NOT worth adding
- Common nouns: 汽车, 红色, 桌子
- Common verbs: 运行, 调用, 返回
- Pronouns/conjunctions: 这个, 那个, 以及
- Names of people (non-famous): 小明, 李老师

## Output format
Return a strict JSON object:

{
  "candidates": [
    {
      "term": "TermName",
      "type": "acronym | concept | theorem | tech | other",
      "definition": "One-sentence brief explanation (10-30 characters)",
      "importance": 0.95
    }
  ]
}

## Importance scoring criteria
- 0.9-1.0: Core technical concept, must explain
- 0.7-0.9: Important concept, recommended to explain
- 0.5-0.7: General concept, optional to explain
- 0.3-0.5: Marginal concept, rarely needed
- 0.0-0.3: Ignore

## Requirements
1. Each term should appear only once
2. Do NOT output terms that don't exist in the article
3. Output at most 20 candidates (longer articles can have slightly more)
4. Focus on the content between [DISCOVER_START] and [DISCOVER_END] markers
5. **The definition must be written in the same language as the article content.** If the article is in Chinese, write definitions in Chinese; if in English, write definitions in English.`;
}

/**
 * Builds the user prompt for term discovery.
 *
 * Uses the [DISCOVER_START]/[DISCOVER_END] marker convention consistent
 * with the unified incremental content pipeline (architecture.md §6.4).
 *
 * @param content - The article content to scan (body text, without frontmatter).
 * @returns The user prompt string.
 */
export function buildDiscoveryUserPrompt(content: string): string {
  return `Scan the following article content for terms that should have wiki entries.

[DISCOVER_START]
${content}
[DISCOVER_END]

Return a JSON object with a "candidates" array. Each candidate must have: "term", "type", "definition", and "importance".

**Important: The definition must be written in the same language as the article content above.** If the article is in Chinese, definitions must be in Chinese; if in English, in English.`;
}
