import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./renderer";

// ============================================================================
// Standard Markdown tests
// ============================================================================

describe("renderMarkdown (standard markdown)", () => {
  it("renders an h1 heading", async () => {
    const html = await renderMarkdown("# Hello", "markdown");
    expect(html).toContain("<h1>Hello</h1>");
  });

  it("renders an h2 heading", async () => {
    const html = await renderMarkdown("## Subtitle", "markdown");
    expect(html).toContain("<h2>Subtitle</h2>");
  });

  it("renders bold text", async () => {
    const html = await renderMarkdown("Hello **world**", "markdown");
    expect(html).toContain("<strong>world</strong>");
  });

  it("renders italic text", async () => {
    const html = await renderMarkdown("Hello *world*", "markdown");
    expect(html).toContain("<em>world</em>");
  });

  it("renders inline code", async () => {
    const html = await renderMarkdown("Use `code` here", "markdown");
    expect(html).toContain("<code>code</code>");
  });

  it("renders fenced code block", async () => {
    const html = await renderMarkdown("```js\nconst x = 1;\n```", "markdown");
    expect(html).toContain("<pre><code");
    expect(html).toContain("const x = 1;");
  });

  it("renders unordered list", async () => {
    const html = await renderMarkdown("- item 1\n- item 2", "markdown");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item 1</li>");
    expect(html).toContain("<li>item 2</li>");
  });

  it("renders ordered list", async () => {
    const html = await renderMarkdown("1. first\n2. second", "markdown");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>first</li>");
    expect(html).toContain("<li>second</li>");
  });

  it("renders blockquote", async () => {
    const html = await renderMarkdown("> A quote", "markdown");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("A quote");
  });

  it("renders links", async () => {
    const html = await renderMarkdown("[click](https://example.com)", "markdown");
    expect(html).toContain('<a href="https://example.com">click</a>');
  });

  it("renders images", async () => {
    const html = await renderMarkdown("![alt](image.png)", "markdown");
    expect(html).toContain('<img src="image.png" alt="alt"');
  });

  it("renders a paragraph", async () => {
    const html = await renderMarkdown("Just some text.", "markdown");
    expect(html).toContain("<p>Just some text.</p>");
  });

  it("renders multiple paragraphs", async () => {
    const html = await renderMarkdown("Para 1.\n\nPara 2.", "markdown");
    expect(html).toContain("<p>Para 1.</p>");
    expect(html).toContain("<p>Para 2.</p>");
  });

  it("renders horizontal rule", async () => {
    const html = await renderMarkdown("---", "markdown");
    expect(html).toContain("<hr");
  });

  it("renders table (GFM)", async () => {
    const html = await renderMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |", "markdown");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders strikethrough (GFM)", async () => {
    const html = await renderMarkdown("~~deleted~~", "markdown");
    expect(html).toContain("<del>");
    expect(html).toContain("deleted");
  });

  it("renders task list (GFM)", async () => {
    const html = await renderMarkdown("- [ ] todo\n- [x] done", "markdown");
    expect(html).toContain('<input type="checkbox" disabled');
  });
});

// ============================================================================
// KaTeX math tests
// ============================================================================

describe("renderMarkdown (KaTeX math)", () => {
  it("renders inline math with single $", async () => {
    const html = await renderMarkdown("Formula $E=mc^2$", "markdown");
    expect(html).toContain('class="katex"');
  });

  it("renders block math with $$", async () => {
    const html = await renderMarkdown("$$\nE=mc^2\n$$", "markdown");
    expect(html).toContain('class="katex-display"');
  });

  it("renders math in Notesaw mode", async () => {
    const html = await renderMarkdown("$\\alpha + \\beta$", "notesaw");
    expect(html).toContain('class="katex"');
  });
});

// ============================================================================
// Notesaw syntax tests
// ============================================================================

describe("renderMarkdown (Notesaw)", () => {
  it("renders a @def block with title", async () => {
    const html = await renderMarkdown("@def Foo {\n    bar\n}", "notesaw");
    expect(html).toContain('class="block-container');
    expect(html).toContain('class="block-label"');
    expect(html).toContain("Definition");
    expect(html).toContain("<p>bar</p>");
  });

  it("renders a @def block without title", async () => {
    const html = await renderMarkdown("@def {\n    content\n}", "notesaw");
    expect(html).toContain('class="block-container');
    expect(html).toContain("<p>content</p>");
  });

  it("renders a @note inline block", async () => {
    const html = await renderMarkdown("@note hello\n", "notesaw");
    expect(html).toContain("inline-block-container");
    expect(html).toContain('class="block-label"');
    expect(html).toContain("Note");
  });

  it("renders @[box] syntax", async () => {
    const html = await renderMarkdown("@[key term]", "notesaw");
    expect(html).toContain('class="box"');
    expect(html).toContain("key term");
  });

  it("renders nested blocks", async () => {
    const html = await renderMarkdown(
      "@theorem 勾股定理 {\n    直角三角形。\n\n    @proof {\n        略。\n    }\n}",
      "notesaw",
    );
    expect(html).toContain("theorem-block-container");
    expect(html).toContain("Theorem");
    expect(html).toContain("proof-block-container");
    expect(html).toContain("Proof");
    expect(html).toContain("勾股定理");
    expect(html).toContain("<p>略。</p>");
  });

  it("renders blocks with abbreviations (thm→theorem)", async () => {
    const html = await renderMarkdown("@thm Test {\n    body\n}", "notesaw");
    expect(html).toContain("theorem-block-container");
    expect(html).toContain("Theorem");
  });

  it("renders blocks with abbreviations (def→definition)", async () => {
    const html = await renderMarkdown("@def Test {\n    body\n}", "notesaw");
    expect(html).toContain("definition-block-container");
    expect(html).toContain("Definition");
  });

  it("renders block with style modifier ?", async () => {
    const html = await renderMarkdown("@note? unsure content\n", "notesaw");
    expect(html).toContain("inline-block-container");
  });

  it("renders block with style modifier !", async () => {
    const html = await renderMarkdown("@note! important\n", "notesaw");
    expect(html).toContain("inline-block-container");
  });

  it("renders multiple blocks", async () => {
    const html = await renderMarkdown("@def A {\n    first\n}\n@def B {\n    second\n}", "notesaw");
    expect(html).toContain("<p>first</p>");
    expect(html).toContain("<p>second</p>");
    // Should have two separate block containers
    expect(html.match(/block-container/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("renders standard markdown inside Notesaw mode", async () => {
    const html = await renderMarkdown("# Title\n\nJust a paragraph.", "notesaw");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>Just a paragraph.</p>");
  });

  it("renders math inside Notesaw mode", async () => {
    const html = await renderMarkdown("@note Formula $E=mc^2$\n", "notesaw");
    expect(html).toContain('class="katex"');
  });

  it("renders a @warn block (abbreviation)", async () => {
    const html = await renderMarkdown("@warn Beware {\n    danger\n}", "notesaw");
    expect(html).toContain("warning-block-container");
    expect(html).toContain("Warning");
  });

  it("renders a @example block", async () => {
    const html = await renderMarkdown("@example Code {\n    print('hello')\n}", "notesaw");
    expect(html).toContain("example-block-container");
    expect(html).toContain("Example");
  });

  it("renders a @alg block (abbreviation for algorithm)", async () => {
    const html = await renderMarkdown("@alg Sort {\n    O(n log n)\n}", "notesaw");
    expect(html).toContain("algorithm-block-container");
  });

  it("renders with correct indentation nesting", async () => {
    const html = await renderMarkdown(
      "@theorem Outer {\n    Content\n\n    @def Nested {\n        Nested content\n    }\n}",
      "notesaw",
    );
    expect(html).toContain("theorem-block-container");
    expect(html).toContain("definition-block-container");
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe("renderMarkdown (edge cases)", () => {
  it("returns empty string for empty input (markdown)", async () => {
    expect(await renderMarkdown("", "markdown")).toBe("");
  });

  it("returns empty string for empty input (notesaw)", async () => {
    expect(await renderMarkdown("", "notesaw")).toBe("");
  });

  it("returns empty string for whitespace-only input", async () => {
    expect(await renderMarkdown("   ", "markdown")).toBe("");
  });

  it("handles a single character", async () => {
    const html = await renderMarkdown("a", "markdown");
    expect(html).toContain("<p>a</p>");
  });

  it("allows raw HTML to pass through (allowDangerousHtml)", async () => {
    const html = await renderMarkdown("<script>alert('xss')</script>", "markdown");
    // With allowDangerousHtml: true, raw HTML passes through the pipeline.
    // XSS prevention is handled by React's dangerouslySetInnerHTML at runtime.
    expect(html).toContain("<script>");
  });
});
