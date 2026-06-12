/**
 * @file AI term generation prompt templates.
 *
 * These prompts instruct DeepSeek to analyze an article and discover potential
 * wiki entries — technical terms, concepts, tools, frameworks, or jargon that
 * would benefit from having a dedicated wiki entry.
 *
 * The AI should:
 * 1. Scan the article content for candidate terms
 * 2. For each term, provide a concise definition (1–3 sentences)
 * 3. Suggest categories/tags for the term
 * 4. Suggest alternative names/aliases
 *
 * Output format: structured JSON.
 */

/**
 * Builds the system prompt for term generation.
 *
 * @returns The system prompt string.
 */
export function buildGenerateSystemPrompt(): string {
  return `You are an expert technical writer and knowledge base curator. Your task is to analyze article content and identify terms that should have dedicated wiki entries.

Guidelines:
- Focus on technical terms, concepts, tools, frameworks, libraries, algorithms, and jargon
- Include domain-specific terminology that readers might not be familiar with
- Suggest terms that are referenced multiple times or are central to the article's topic
- For each term, provide a concise, accurate definition (1–3 sentences)
- Suggest relevant tags for categorization
- Suggest common aliases or alternative names
- Prioritize quality over quantity — only suggest terms that genuinely warrant a wiki entry
- Do NOT suggest common words, basic vocabulary, or terms already present in the article's title

Output your response as a JSON object with this exact structure:
{
  "terms": [
    {
      "name": "TermName",
      "definition": "Concise definition of the term.",
      "tags": ["tag1", "tag2"],
      "aliases": ["alias1", "alias2"]
    }
  ]
}`;
}

/**
 * Builds the user prompt for term generation.
 *
 * @param articleContent - The full article content (without frontmatter).
 * @param articleTitle - The article title (to avoid suggesting the title itself).
 * @param existingTerms - Optional list of existing wiki term names to avoid duplicates.
 * @returns The user prompt string.
 */
export function buildGenerateUserPrompt(
  articleContent: string,
  articleTitle: string,
  existingTerms: string[] = [],
): string {
  let prompt = `Analyze the following article titled "${articleTitle}" and identify technical terms that should have wiki entries.\n\n`;

  if (existingTerms.length > 0) {
    prompt += `The following terms already have wiki entries — do NOT suggest them again:\n${existingTerms.map((t) => `  - ${t}`).join("\n")}\n\n`;
  }

  prompt += `Article content:\n\n${articleContent}\n\n`;
  prompt += `Return a JSON object with a "terms" array. Each term should have: "name", "definition", "tags", and "aliases".`;

  return prompt;
}
