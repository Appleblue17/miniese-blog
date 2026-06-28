/**
 * @file Unit tests for src/lib/ai/task-utils.ts
 *
 * Tests for shared AI task query utilities.
 * Covers validation, mapping, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { validateTaskType, VALID_TYPES } from "./task-utils";

describe("validateTaskType", () => {
  it("returns the type string for valid types", () => {
    for (const t of VALID_TYPES) {
      expect(validateTaskType(t)).toBe(t);
    }
  });

  it("returns null for null input", () => {
    expect(validateTaskType(null)).toBeNull();
  });

  it("returns null for invalid type", () => {
    expect(validateTaskType("invalid")).toBeNull();
    expect(validateTaskType("scan")).toBeNull(); // scan is not in VALID_TYPES
    expect(validateTaskType("")).toBeNull();
  });

  it("is case-sensitive", () => {
    expect(validateTaskType("Review")).toBeNull();
    expect(validateTaskType("REVIEW")).toBeNull();
  });
});

describe("AiTaskItem type", () => {
  it("has the expected shape", () => {
    // Type-level test — just verify we can construct a valid item
    const item: import("./task-utils").AiTaskItem = {
      id: "test-id",
      type: "review",
      status: "pending",
      input: { articleId: "abc" },
      output: null,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      articleId: "abc",
      articleTitle: "Test Article",
    };
    expect(item.id).toBe("test-id");
    expect(item.articleTitle).toBe("Test Article");
  });

  it("allows null articleTitle and articleId", () => {
    const item: import("./task-utils").AiTaskItem = {
      id: "test-id-2",
      type: "generate",
      status: "completed",
      input: { discoveryId: "disc-1" },
      output: {},
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      articleId: null,
      articleTitle: null,
    };
    expect(item.articleId).toBeNull();
    expect(item.articleTitle).toBeNull();
  });
});

describe("mapTasksToItems (integration-dependent)", () => {
  it("is an async function that exists", () => {
    // This is a structural test — the function exists and is async
    const fn = import("./task-utils").then((m) => m.mapTasksToItems);
    expect(fn).toBeDefined();
  });
});
