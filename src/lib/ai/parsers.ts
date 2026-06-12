/**
 * @file AI response parsers.
 *
 * Parses structured JSON responses from the DeepSeek API into typed objects.
 * Handles common AI output quirks (markdown code blocks, extra text, etc.).
 */

import type { ReviewReport, GenerateResult } from "../../types/ai";

const VALID_SECTION_TYPES = new Set(["factual", "typo", "clarity", "other"] as const);

type SectionType = "factual" | "typo" | "clarity" | "other";
type Severity = "error" | "warning" | "suggestion" | "ok";

/**
 * Extracts a JSON object from a string that may contain markdown code blocks
 * or surrounding explanatory text.
 *
 * @param text - The raw AI response text.
 * @returns The extracted JSON string, or null if none found.
 */
function extractJson(text: string): string | null {
  // Try to find JSON within markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find a JSON object directly in the text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return null;
}

/**
 * @deprecated Translation response parsing is no longer needed.
 * translator2.ts uses `[TRANSLATE_START]/[TRANSLATE_END]` markers directly.
 */
export interface TranslateResponse {
  translations: Record<string, string>;
}

/**
 * Parses a DeepSeek review response into a structured ReviewReport.
 *
 * Handles:
 * - JSON wrapped in markdown code blocks (```json ... ```)
 * - JSON wrapped in plain code blocks (``` ... ```)
 * - JSON with surrounding explanatory text
 * - Invalid or missing fields gracefully (returns null)
 *
 * @param responseText - The raw text response from DeepSeek.
 * @returns A parsed ReviewReport, or null if parsing failed.
 */
/**
 * Parses a DeepSeek term generation response into a structured GenerateResult.
 *
 * Expected format:
 * ```json
 * {
 *   "terms": [
 *     {
 *       "name": "TermName",
 *       "definition": "Concise definition of the term.",
 *       "tags": ["tag1", "tag2"],
 *       "aliases": ["alias1", "alias2"]
 *     }
 *   ]
 * }
 * ```
 *
 * @param responseText - The raw text response from DeepSeek.
 * @returns A parsed GenerateResult, or null if parsing failed.
 */
export function parseGenerateResponse(responseText: string): GenerateResult | null {
  try {
    const jsonStr = extractJson(responseText);
    if (!jsonStr) {
      return null;
    }

    const parsed = JSON.parse(jsonStr) as {
      terms?: Array<{
        name?: string;
        definition?: string;
        tags?: string[];
        aliases?: string[];
      }>;
    };

    if (!parsed.terms || !Array.isArray(parsed.terms)) {
      return null;
    }

    const terms = parsed.terms
      .filter((t) => t.name && t.name.trim())
      .map((t) => ({
        name: t.name!.trim(),
        definition: (t.definition ?? "").trim(),
        tags: Array.isArray(t.tags)
          ? t.tags.filter((tag): tag is string => typeof tag === "string")
          : [],
        aliases: Array.isArray(t.aliases)
          ? t.aliases.filter((a): a is string => typeof a === "string")
          : [],
      }));

    if (terms.length === 0) {
      return null;
    }

    return { terms };
  } catch {
    return null;
  }
}

export function parseReviewReport(responseText: string): ReviewReport | null {
  try {
    const jsonStr = extractJson(responseText);
    if (!jsonStr) {
      return null;
    }

    const parsed = JSON.parse(jsonStr) as {
      sections?: Array<{
        type: string;
        title: string;
        items: Array<{
          severity: string;
          lineStart?: number;
          lineEnd?: number;
          snippet?: string;
          issue: string;
          suggestion: string;
        }>;
      }>;
    };

    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      return null;
    }

    const sections: Array<{
      type: SectionType;
      title: string;
      items: Array<{
        severity: Severity;
        lineStart: number;
        lineEnd: number;
        snippet: string;
        issue: string;
        suggestion: string;
      }>;
    }> = parsed.sections
      .filter((s) => VALID_SECTION_TYPES.has(s.type as SectionType))
      .map((s) => ({
        type: s.type as SectionType,
        title: s.title || "",
        items: (s.items || []).map((item) => ({
          severity: (["error", "warning", "suggestion", "ok"] as Severity[]).includes(
            item.severity as Severity,
          )
            ? (item.severity as Severity)
            : "warning",
          lineStart: item.lineStart ?? 0,
          lineEnd: item.lineEnd ?? 0,
          snippet: item.snippet ?? "",
          issue: item.issue || "",
          suggestion: item.suggestion || "",
        })),
      }));

    return { sections };
  } catch {
    return null;
  }
}
