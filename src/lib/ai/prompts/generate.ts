/**
 * @file AI single term content generation prompt templates.
 *
 * These prompts instruct DeepSeek to generate a complete wiki entry for
 * a single term, given its name and a short hint/definition.
 *
 * Output format: structured JSON with definition, content, aliases, tags, type.
 */

/**
 * Builds the system prompt for single term generation.
 *
 * @returns The system prompt string.
 */
export function buildGenerateSystemPrompt(): string {
  return `You are a technical encyclopedia editor. Generate a complete wiki entry for the given term.

## Output format
Return a strict JSON object:

{
  "aliases": ["alias1", "alias2"],
  "definition": "Short definition (30-80 chars, for hover preview)",
  "content": "Detailed introduction...\\n\\n#### Examples\\n...",
  "tags": ["tag1", "tag2"],
  "type": "acronym | concept | theorem | tech | other"
}

## Writing requirements
1. **definition**: One concise sentence, suitable for hover preview. Write in the same language as the term's context.
2. **content**: Full tutorial-style wiki entry in Markdown, including:
   - Detailed introduction (2-3 paragraphs)
   - Examples or usage (if applicable)
   - Related concepts (if applicable)
   - Write formulas using KaTeX, inline formulas can use $formula$ format and display formulas use $$formula$$ format
   - Do NOT include a top-level title for the entry (name is already displayed on the page)
   - Use \`####\` (level-4 headings) for subsections, and avoid nesting headings
3. **aliases**: Common alternative names or abbreviations
4. **tags**: Categories for classification
5. **type**: One of: acronym, concept, theorem, tech, other

## Based on training knowledge
- Use your existing knowledge to generate content
- Do NOT fabricate non-existent information
- If you genuinely cannot generate meaningful content, return { "unable": true }`;
}

/**
 * Builds the user prompt for single term generation.
 *
 * @param term - The term name.
 * @param definitionHint - A short hint/definition from discovery (for reference).
 * @param context - Optional article context (slug or snippet) for relevance.
 * @returns The user prompt string.
 */
export function buildGenerateUserPrompt(
  term: string,
  definitionHint: string,
  context?: string,
): string {
  let prompt = `Generate a wiki entry for the following term:\n\n`;
  prompt += `- Term: ${term}\n`;
  prompt += `- Short hint (reference only): ${definitionHint || "none"}\n`;

  if (context) {
    prompt += `- Context (article slug): ${context}\n`;
  }

  prompt += `\nReturn a JSON object with: "aliases", "definition", "content", "tags", "type".\n`;
  prompt += `If you cannot generate meaningful content, return { "unable": true }.`;

  return prompt;
}
