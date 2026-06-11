/**
 * @file DeepSeek API client.
 *
 * Provides a unified interface for calling the DeepSeek API.
 * Supports retry, timeout, JSON mode, and token usage tracking.
 */

/**
 * Options for calling the DeepSeek API.
 */
export interface CallOptions {
  /** The prompt to send to the model */
  prompt: string;
  /** Request JSON-structured output (adds system instruction) */
  responseFormat?: "json" | "text";
  /** Sampling temperature (0-2, default 0.7) */
  temperature?: number;
  /** Maximum tokens in the response */
  maxTokens?: number;
}

/**
 * Token usage statistics from an API call.
 */
export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Result of a DeepSeek API call.
 */
export interface CallResult {
  /** The text content of the model's response */
  content: string;
  /** Token usage statistics */
  usage: Usage;
}

const DEFAULT_TEMPERATURE = 0.7;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 60_000;

function getConfig(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL;

  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. Please configure it in your .env file.",
    );
  }

  return {
    apiKey,
    baseUrl: baseUrl || "https://api.deepseek.com",
  };
}

/**
 * Sleep for `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the DeepSeek API with the given options.
 *
 * Features:
 * - Automatic retry (up to 3 times) with exponential backoff
 * - 60-second timeout
 * - JSON mode support (adds system instruction for valid JSON)
 * - Token usage tracking
 *
 * @param options - Call options including prompt, format, temperature, etc.
 * @returns The response content and token usage.
 * @throws If all retries are exhausted or the API returns an error.
 */
export async function callDeepSeek(options: CallOptions): Promise<CallResult> {
  const { apiKey, baseUrl } = getConfig();
  const { prompt, responseFormat, temperature, maxTokens } = options;

  const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;

  const messages: Array<{ role: string; content: string }> = [];

  if (responseFormat === "json") {
    messages.push({
      role: "system",
      content:
        "You are a helpful assistant. Always respond with valid JSON. Do not include markdown code blocks or any text outside the JSON object.",
    });
  }

  messages.push({ role: "user", content: prompt });

  const body: Record<string, unknown> = {
    model: "deepseek-chat",
    messages,
    temperature: temperature ?? DEFAULT_TEMPERATURE,
    max_tokens: maxTokens ?? 4096,
  };

  if (responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, 4s
      const delay = 1000 * Math.pow(2, attempt - 1);
      console.log(
        `[DeepSeek] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`,
      );
      await sleep(delay);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `DeepSeek API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage: Usage;
      };

      const content = data.choices?.[0]?.message?.content ?? "";
      const usage: Usage = data.usage ?? {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      console.log(
        `[DeepSeek] Success: ${usage.total_tokens} tokens used ` +
          `(${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion)`,
      );

      return { content, usage };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on abort/timeout if it was the last attempt
      if (attempt < MAX_RETRIES) {
        console.error(
          `[DeepSeek] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: ${lastError.message}`,
        );
      }
    }
  }

  throw lastError ?? new Error("Unknown error calling DeepSeek API");
}
