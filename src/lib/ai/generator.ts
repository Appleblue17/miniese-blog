/**
 * @file Single term wiki entry generator.
 *
 * Takes a term name and hint, calls DeepSeek to generate a complete
 * wiki entry (definition + content + aliases + tags + type), and
 * returns the result for the worker to save.
 */

import { callDeepSeek } from "./client";
import { buildGenerateSystemPrompt, buildGenerateUserPrompt } from "./prompts/generate";

/**
 * A generated wiki entry from AI.
 */
export interface GeneratedWiki {
  /** Alternative names / abbreviations */
  aliases: string[];
  /** Short definition (30-80 chars, for hover preview) */
  definition: string;
  /** Full tutorial-style wiki content in Markdown */
  content: string;
  /** Classification tags */
  tags: string[];
  /** Term type */
  type: string;
}

/**
 * Result of a term generation attempt.
 *
 * - If successful: `success: true`, `entry: GeneratedWiki`
 * - If AI cannot generate: `success: false`, `reason: "unable"`
 * - If parsing failed: `success: false`, `reason: "parse_error"`
 */
export interface GenerateResult {
  success: boolean;
  entry?: GeneratedWiki;
  reason?: string;
}

/**
 * Generates a complete wiki entry for a single term using DeepSeek.
 *
 * @param term - The term name to generate content for.
 * @param definitionHint - Short hint/definition from discovery (for reference).
 * @param context - Optional article slug for context.
 * @param customGeneratePrompt - Optional custom generate prompt template.
 * @returns A GenerateResult with the generated entry or error info.
 */
export async function generateWikiEntry(
  term: string,
  definitionHint: string,
  context?: string,
  customGeneratePrompt?: string,
): Promise<GenerateResult> {
  let combinedPrompt: string;

  if (customGeneratePrompt) {
    // Use custom prompt with placeholder substitution
    combinedPrompt = customGeneratePrompt
      .replace(/\{\{term\}\}/g, term)
      .replace(/\{\{definitionHint\}\}/g, definitionHint || "none")
      .replace(/\{\{context\}\}/g, context || "none");
  } else {
    const systemPrompt = buildGenerateSystemPrompt();
    const userPrompt = buildGenerateUserPrompt(term, definitionHint, context);
    combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
  }

  console.log(`[Generator] Generating wiki entry for term: "${term}"`);

  try {
    const response = await callDeepSeek({
      prompt: combinedPrompt,
      responseFormat: "json",
      temperature: 0.3,
      maxTokens: 4096,
    });

    const parsed = parseGenerateResponse(response.content);

    if (!parsed) {
      console.warn(`[Generator] Failed to parse AI response for term: "${term}"`);
      return { success: false, reason: "parse_error" };
    }

    if (parsed.unable) {
      console.log(`[Generator] AI unable to generate content for term: "${term}"`);
      return { success: false, reason: "unable" };
    }

    console.log(`[Generator] Successfully generated wiki entry for term: "${term}"`);

    return {
      success: true,
      entry: {
        aliases: parsed.aliases,
        definition: parsed.definition,
        content: parsed.content,
        tags: parsed.tags,
        type: parsed.type,
      },
    };
  } catch (err) {
    console.warn(
      `[Generator] AI call failed for term "${term}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return { success: false, reason: "ai_error" };
  }
}

/**
 * Parses the AI response JSON for single term generation.
 *
 * Expected format:
 * {
 *   "aliases": ["alias1"],
 *   "definition": "Short definition",
 *   "content": "Full markdown content",
 *   "tags": ["tag1"],
 *   "type": "tech",
 *   "unable": true  // optional — if true, AI cannot generate
 * }
 *
 * @param responseText - Raw AI response string.
 * @returns Parsed result or null.
 */
function parseGenerateResponse(responseText: string): {
  aliases: string[];
  definition: string;
  content: string;
  tags: string[];
  type: string;
  unable?: boolean;
} | null {
  try {
    // Try to extract JSON from code blocks or raw text
    const jsonStr = extractJson(responseText);
    if (!jsonStr) return null;

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    // Check for "unable" signal
    if (parsed.unable === true) {
      return { unable: true, aliases: [], definition: "", content: "", tags: [], type: "" };
    }

    if (typeof parsed.definition !== "string" || !parsed.definition.trim()) {
      return null;
    }
    if (typeof parsed.content !== "string" || !parsed.content.trim()) {
      return null;
    }

    return {
      aliases: Array.isArray(parsed.aliases)
        ? parsed.aliases.filter((a): a is string => typeof a === "string")
        : [],
      definition: (parsed.definition as string).trim(),
      content: (parsed.content as string).trim(),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t): t is string => typeof t === "string")
        : [],
      type: typeof parsed.type === "string" ? parsed.type.trim() : "other",
    };
  } catch {
    return null;
  }
}

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
