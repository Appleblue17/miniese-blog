/**
 * @file AI term refinement for manual wiki discovery entries.
 *
 * When a user manually creates a WikiDiscovery for a single term,
 * this function calls DeepSeek to generate:
 * - Type classification (acronym | concept | theorem | tech | other)
 * - One-sentence definition
 * - Importance score (0-1)
 *
 * This is a synchronous (blocking) call, intended for use server-side
 * in API routes where the frontend waits for completion.
 */

import { callDeepSeek } from "./client";

export interface RefinedTerm {
  type: string;
  definition: string;
  importance: number;
}

const REFINE_PROMPT_TEMPLATE = `You are a knowledge base curation assistant. Analyze the following term and provide structured metadata for a wiki entry.

Term: "{{TERM}}"
Language: {{LANG}}

## Output format
Return a strict JSON object:

{
  "type": "acronym | concept | theorem | tech | other",
  "definition": "One-sentence brief explanation (10-30 characters, in the same language as the term)",
  "importance": 0.85
}

## Type classification
- acronym: Abbreviations (e.g., API, DFS, RFC)
- concept: Technical or abstract concepts (e.g., 闭包, 依赖注入)
- theorem: Theorems, formulas, laws (e.g., 勾股定理, 贝叶斯定理)
- tech: Tools, frameworks, languages (e.g., TypeScript, Docker, PostgreSQL)
- other: Everything else that doesn't fit above

## Importance scoring
- 0.9-1.0: Core technical concept, must explain
- 0.7-0.9: Important concept, recommended to explain
- 0.5-0.7: General concept, optional to explain
- 0.3-0.5: Marginal concept, rarely needed
- 0.0-0.3: Not worth documenting

Return ONLY valid JSON. No markdown, no extra text.`;

/**
 * Refines a single term by calling DeepSeek API synchronously.
 *
 * @param term - The term name to refine.
 * @param lang - The language of the term ("zh" | "en").
 * @returns Refined metadata, or default values if the API call fails.
 */
export async function refineTerm(
  term: string,
  lang: string,
): Promise<RefinedTerm> {
  try {
    const prompt = REFINE_PROMPT_TEMPLATE.replace("{{TERM}}", term).replace(
      "{{LANG}}",
      lang === "zh" ? "Chinese" : "English",
    );

    const response = await callDeepSeek({
      prompt,
      responseFormat: "json",
      temperature: 0.3,
      maxTokens: 512,
    });

    // Parse JSON from response
    const parsed = JSON.parse(response.content) as {
      type?: string;
      definition?: string;
      importance?: number;
    };

    const validTypes = ["acronym", "concept", "theorem", "tech", "other"];

    return {
      type: parsed.type && validTypes.includes(parsed.type) ? parsed.type : "other",
      definition: parsed.definition?.trim() ?? "",
      importance:
        typeof parsed.importance === "number" &&
        parsed.importance >= 0 &&
        parsed.importance <= 1
          ? parsed.importance
          : 0.5,
    };
  } catch (err) {
    console.warn(
      `[RefineTerm] AI refinement failed for "${term}": ${err instanceof Error ? err.message : String(err)}`,
    );
    // Return safe defaults
    return {
      type: "other",
      definition: "",
      importance: 0.5,
    };
  }
}
