/**
 * @file Tests for DeepSeek API client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch before importing the module
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const ORIGINAL_API_KEY = process.env.DEEPSEEK_API_KEY;
const ORIGINAL_BASE_URL = process.env.DEEPSEEK_BASE_URL;

describe("callDeepSeek", () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "sk-test-key";
    process.env.DEEPSEEK_BASE_URL = "https://api.test.com";
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env.DEEPSEEK_API_KEY = ORIGINAL_API_KEY;
    process.env.DEEPSEEK_BASE_URL = ORIGINAL_BASE_URL;
    vi.restoreAllMocks();
  });

  it("sends correct request to DeepSeek API (text mode)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello response" } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    });

    const { callDeepSeek } = await import("./client");
    const result = await callDeepSeek({ prompt: "Hello" });

    expect(result.content).toBe("Hello response");
    expect(result.usage.total_tokens).toBe(30);

    // Verify fetch call
    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[0]).toBe("https://api.test.com/v1/chat/completions");
    expect(fetchCall[1].method).toBe("POST");
    expect(fetchCall[1].headers).toMatchObject({
      Authorization: "Bearer sk-test-key",
      "Content-Type": "application/json",
    });
  });

  it("sends correct request with JSON mode", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"key": "value"}' } }],
        usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 },
      }),
    });

    const { callDeepSeek } = await import("./client");
    const result = await callDeepSeek({
      prompt: "Return JSON",
      responseFormat: "json",
    });

    expect(result.content).toBe('{"key": "value"}');

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody.response_format).toEqual({ type: "json_object" });
    expect(requestBody.messages[0].content).toContain("JSON");
  });

  it("respects temperature and maxTokens", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Result" } }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      }),
    });

    const { callDeepSeek } = await import("./client");
    await callDeepSeek({
      prompt: "Test",
      temperature: 0.3,
      maxTokens: 500,
    });

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody.temperature).toBe(0.3);
    expect(requestBody.max_tokens).toBe(500);
  });

  it("retries on failure with exponential backoff", async () => {
    // Make fetch fail twice, succeed on third
    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error again"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Final" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      });

    const { callDeepSeek } = await import("./client");
    const result = await callDeepSeek({ prompt: "Retry test" });

    expect(result.content).toBe("Final");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws after max retries exhausted", { timeout: 15000 }, async () => {
    mockFetch.mockRejectedValue(new Error("Persistent failure"));

    const { callDeepSeek } = await import("./client");

    await expect(callDeepSeek({ prompt: "Fail" })).rejects.toThrow(
      /Persistent failure/i,
    );
    // Initial + 3 retries = 4 total attempts
    expect(mockFetch.mock.calls.length).toBe(4);
  });

  it("uses custom base URL when provided", async () => {
    process.env.DEEPSEEK_BASE_URL = "https://custom.api.com/v2";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Custom URL" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    });

    const { callDeepSeek } = await import("./client");
    await callDeepSeek({ prompt: "Test" });

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://custom.api.com/v2/v1/chat/completions",
    );
  });

  it("uses default temperature when not specified", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Result" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    });

    const { callDeepSeek } = await import("./client");
    await callDeepSeek({ prompt: "Test" });

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody.temperature).toBe(0.7);
  });

  it("handles API error response with retry", { timeout: 15000 }, async () => {
    // Only one failed response, then succeed
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => "Rate limit exceeded",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Recovered" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      });

    const { callDeepSeek } = await import("./client");
    const result = await callDeepSeek({ prompt: "Test" });

    expect(result.content).toBe("Recovered");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws if DEEPSEEK_API_KEY is not set", async () => {
    delete process.env.DEEPSEEK_API_KEY;

    const { callDeepSeek } = await import("./client");

    await expect(callDeepSeek({ prompt: "Test" })).rejects.toThrow(
      /DEEPSEEK_API_KEY/i,
    );
  });
});
