/**
 * @file Wiki term discovery logic.
 *
 * Scans article content for candidate wiki terms by calling DeepSeek API.
 * Deduplicates across:
 * 1. Terms within the same AI response (case-insensitive)
 * 2. Existing WikiEntry records (already reviewed or proposed)
 * 3. Existing WikiDiscovery proposals for the same article (any status)
 *
 * Uses the unified chunking pipeline (splitArticle) for long articles:
 * - Short articles (≤ MAX_CHUNK_SIZE) are sent as one API call
 * - Long articles are split into chunks; each chunk is sent separately
 * - Results are merged and deduplicated
 *
 * Follows the architecture.md §6.4 unified incremental content pipeline
 * conventions, with [DISCOVER_START]/[DISCOVER_END] markers.
 */

import { prisma } from "../db";
import { callDeepSeek } from "./client";
import { splitArticle, stripFrontmatter } from "./chunker/chunker";
import { buildDiscoverySystemPrompt, buildDiscoveryUserPrompt } from "./prompts/discovery";

/**
 * A candidate term discovered by the AI.
 */
export interface DiscoveryCandidate {
  /** The term name */
  term: string;
  /** Type: acronym | concept | theorem | tech | other */
  type: string;
  /** One-sentence definition */
  definition: string;
  /** Importance score (0-1) */
  importance: number;
}

/**
 * Scans article content and returns candidate wiki terms, deduplicated.
 *
 * For long articles, automatically splits into chunks using the
 * pipeline's chunker (splitArticle) and processes each chunk separately.
 *
 * @param articleId - The article's database ID.
 * @param articleLang - The article's language code ("zh" | "en").
 * @param content - The full article content (may include frontmatter).
 * @returns A deduplicated list of candidate terms.
 */
export async function discoverWikiCandidates(
  articleId: string,
  articleLang: string,
  content: string,
): Promise<DiscoveryCandidate[]> {
  // 1. Strip frontmatter to get body
  const body = stripFrontmatter(content);
  if (!body.trim()) {
    return [];
  }

  // 2. Split article into chunks if long
  const chunks = splitArticle(body);

  // 3. Process each chunk, collect candidates
  const allCandidates: DiscoveryCandidate[] = [];

  for (const chunk of chunks) {
    try {
      const candidates = await processChunk(chunk.content);
      allCandidates.push(...candidates);
    } catch (err) {
      console.warn(
        `[Discovery] Failed to process chunk "${chunk.title}": ${err instanceof Error ? err.message : String(err)}`,
      );
      // Continue with next chunk
    }
  }

  // 4. Deduplicate within results (case-insensitive)
  const uniqueCandidates = deduplicateByTerm(allCandidates);

  // 5. Filter out existing wiki entries (case-insensitive, same language)
  const filtered = await filterExistingWikiEntries(uniqueCandidates, articleLang);

  // 6. Filter out existing pending proposals (same article)
  return filterPendingProposals(filtered, articleId);
}

/**
 * Processes a single chunk of article content through the AI.
 *
 * @param chunkContent - The chunk content to scan.
 * @returns List of candidate terms from this chunk.
 */
async function processChunk(chunkContent: string): Promise<DiscoveryCandidate[]> {
  const systemPrompt = buildDiscoverySystemPrompt();
  const userPrompt = buildDiscoveryUserPrompt(chunkContent);
  const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const response = await callDeepSeek({
    prompt: combinedPrompt,
    responseFormat: "json",
    temperature: 0.3,
    maxTokens: 4096,
  });

  // Parse the response
  return parseDiscoveryResponse(response.content);
}

/**
 * Parses the AI response into candidate terms.
 *
 * @param responseContent - Raw AI response string.
 * @returns List of candidate terms, or empty array if parsing fails.
 */
function parseDiscoveryResponse(responseContent: string): DiscoveryCandidate[] {
  try {
    const parsed = JSON.parse(responseContent);
    if (!parsed.candidates || !Array.isArray(parsed.candidates)) {
      return [];
    }

    return parsed.candidates
      .filter(
        (c: unknown) =>
          c &&
          typeof c === "object" &&
          typeof (c as Record<string, unknown>).term === "string" &&
          typeof (c as Record<string, unknown>).type === "string" &&
          typeof (c as Record<string, unknown>).definition === "string" &&
          typeof (c as Record<string, unknown>).importance === "number",
      )
      .map((c: Record<string, unknown>) => ({
        term: String(c.term),
        type: String(c.type),
        definition: String(c.definition),
        importance: Number(c.importance),
      }));
  } catch {
    // Malformed JSON
    return [];
  }
}

/**
 * Deduplicates candidates by term (case-insensitive).
 * Keeps the first occurrence of each term.
 *
 * @param candidates - Raw candidate list.
 * @returns Deduplicated candidate list.
 */
function deduplicateByTerm(candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = c.term.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Removes candidates whose term already exists as a wiki entry
 * in the same language.
 *
 * @param candidates - Deduplicated candidate list.
 * @param language - The article's language.
 * @returns Filtered candidate list.
 */
async function filterExistingWikiEntries(
  candidates: DiscoveryCandidate[],
  language: string,
): Promise<DiscoveryCandidate[]> {
  if (candidates.length === 0) return [];

  const existingEntries = await prisma.wikiEntry.findMany({
    where: {
      language: language as "zh" | "en",
    },
    select: { name: true },
  });

  if (existingEntries.length === 0) return candidates;

  const existingSet = new Set(existingEntries.map((e) => e.name.toLowerCase().trim()));

  return candidates.filter((c) => !existingSet.has(c.term.toLowerCase().trim()));
}

/**
 * Removes candidates whose term already exists in ANY discovery proposal
 * (pending, approved, or rejected) for the same article.
 *
 * This prevents the same term from being discovered multiple times for
 * the same article across different discovery runs.
 *
 * @param candidates - Deduplicated candidate list.
 * @param articleId - The article's database ID.
 * @returns Filtered candidate list.
 */
async function filterPendingProposals(
  candidates: DiscoveryCandidate[],
  articleId: string,
): Promise<DiscoveryCandidate[]> {
  if (candidates.length === 0) return [];

  const existingProposals = await prisma.wikiDiscovery.findMany({
    where: {
      articleId,
    },
    select: { term: true },
  });

  if (existingProposals.length === 0) return candidates;

  const existingSet = new Set(existingProposals.map((p) => p.term.toLowerCase().trim()));

  return candidates.filter((c) => !existingSet.has(c.term.toLowerCase().trim()));
}
