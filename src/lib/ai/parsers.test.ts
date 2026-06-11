/**
 * @file Tests for AI response parsers.
 */

import { describe, it, expect } from "vitest";
import { parseReviewReport } from "./parsers";
import type { ReviewReport } from "../../types/ai";

describe("parseReviewReport", () => {
  it("parses a valid review report JSON", () => {
    const json = JSON.stringify({
      sections: [
        {
          type: "factual",
          title: "事实性错误",
          items: [
            {
              severity: "error",
              lineStart: 5,
              lineEnd: 7,
              snippet: "原文摘录",
              issue: "问题描述",
              suggestion: "修改建议",
            },
          ],
        },
        {
          type: "typo",
          title: "拼写与语法",
          items: [],
        },
        {
          type: "clarity",
          title: "表达歧义与通顺性",
          items: [
            {
              severity: "suggestion",
              lineStart: 10,
              lineEnd: 12,
              snippet: "长段落",
              issue: "段落过长",
              suggestion: "拆分为短段",
            },
          ],
        },
        {
          type: "other",
          title: "其他建议",
          items: [],
        },
      ],
    });

    const result = parseReviewReport(json);
    expect(result).not.toBeNull();
    expect(result!.sections).toHaveLength(4);
    expect(result!.sections[0].items).toHaveLength(1);
    expect(result!.sections[2].items).toHaveLength(1);
    expect(result!.sections[0].items[0].severity).toBe("error");
  });

  it("returns null for invalid JSON", () => {
    const result = parseReviewReport("not json");
    expect(result).toBeNull();
  });

  it("returns null for missing sections", () => {
    const result = parseReviewReport(JSON.stringify({ foo: "bar" }));
    expect(result).toBeNull();
  });

  it("handles JSON wrapped in markdown code blocks", () => {
    const wrapped = "```json\n{\n  \"sections\": []\n}\n```";
    const result = parseReviewReport(wrapped);
    expect(result).not.toBeNull();
    expect(result!.sections).toEqual([]);
  });

  it("handles JSON wrapped in plain code blocks", () => {
    const wrapped = "```\n{\"sections\": []}\n```";
    const result = parseReviewReport(wrapped);
    expect(result).not.toBeNull();
    expect(result!.sections).toEqual([]);
  });

  it("handles JSON with extra text before/after", () => {
    const wrapped =
      'Here is the review:\n\n{"sections": [{"type": "factual", "title": "Test", "items": []}]}\n\nEnd.';
    const result = parseReviewReport(wrapped);
    expect(result).not.toBeNull();
    expect(result!.sections).toHaveLength(1);
  });

  it("filters out unknown section types", () => {
    const json = JSON.stringify({
      sections: [
        {
          type: "unknown_type",
          title: "Unknown",
          items: [{ severity: "error", issue: "test", suggestion: "fix" }],
        },
        { type: "typo", title: "拼写", items: [] },
      ],
    });

    const result = parseReviewReport(json);
    expect(result).not.toBeNull();
    expect(result!.sections).toHaveLength(1);
    expect(result!.sections[0].type).toBe("typo");
  });

  it("extracts content from AI response with content field", () => {
    // Simulate the structure from CallResult
    const aiResponse = {
      content: '{"sections": []}',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    const result = parseReviewReport(aiResponse.content);
    expect(result).not.toBeNull();
    expect(result!.sections).toEqual([]);
  });
});
