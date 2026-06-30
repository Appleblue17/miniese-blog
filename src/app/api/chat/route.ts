/**
 * @file POST /api/chat — AI chat with Miniese (SSE streaming).
 *
 * Directly calls DeepSeek API (no queue), returns SSE stream.
 * Open to all users (no auth required), but rate-limited.
 *
 * Optionally accepts a `selection` object with article context, which is
 * appended to the system prompt to help Miniese answer about selected text.
 *
 * System prompt is loaded from site settings (prompts.chat) so admins can
 * customize Miniese's persona via the settings page.
 *
 * Request:
 *   {
 *     messages: [{ role: "user" | "assistant", content: string }],
 *     selection?: {
 *       text: string,
 *       surroundingContext: string,
 *       articleTitle: string,
 *       articleExcerpt?: string,
 *       headingPath: string
 *     }
 *   }
 *
 * Response:
 *   SSE stream with `data: {"content": "..."}` events.
 */

import { NextResponse } from "next/server";
import { getSettings } from "../../../../config/settings";
import { prisma } from "@/lib/db";
import type { SelectionInfo } from "@/types/ai";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  selection?: SelectionInfo;
}

// Rate limit: simple in-memory IP-based limiter
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW = 10_000; // 10 seconds
const RATE_LIMIT_MAX = 5; // max 5 requests per window

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const lastReset = rateLimitMap.get(ip) || 0;

  if (now - lastReset > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, now);
    return true;
  }

  const count = rateLimitMap.get(`${ip}:count`) || 0;
  if (count >= RATE_LIMIT_MAX) {
    return false;
  }

  rateLimitMap.set(`${ip}:count`, count + 1);
  return true;
}

export async function POST(request: Request) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "请求过于频繁，请稍后再试" },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { messages, selection } = body as ChatRequestBody;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }

    // Validate message limit
    if (messages.length > 20) {
      return NextResponse.json({ error: "消息数量超出限制" }, { status: 400 });
    }

    // Validate total content length
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (totalChars > 8000) {
      return NextResponse.json({ error: "内容过长" }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

    if (!apiKey) {
      return NextResponse.json(
        { error: "AI 服务未配置" },
        { status: 503 },
      );
    }

    // Load system prompt from site settings (prompts.chat), fall back to default
    const settings = await getSettings();
    let systemContent = settings.prompts?.chat?.trim() || "你是 Miniese，一个友好的 AI 助手。你运行在 Miniese's Blog 上，帮助读者理解文章内容。请用与用户相同的语言回答。回答要简洁、准确、有帮助。如果用户询问文章相关的问题，结合你的知识给出回答。如果不确定，坦诚说明。";

    // If selection context is provided, append it to the system prompt
    if (selection) {
      const contextParts: string[] = [];

      contextParts.push(`## 用户正在查看文章「${selection.articleTitle}」`);

      if (selection.articleExcerpt) {
        contextParts.push(`文章摘要：${selection.articleExcerpt}`);
      }

      if (selection.headingPath) {
        contextParts.push(`当前位置：${selection.headingPath}`);
      }

      contextParts.push(`\n用户选中了以下内容：`);
      contextParts.push(`\`\`\`\n${selection.text}\n\`\`\``);

      contextParts.push(`\n上下文：`);
      contextParts.push(`\`\`\`\n${selection.surroundingContext}\n\`\`\``);

      systemContent += `\n\n${contextParts.join("\n")}`;
    }

    const systemMessage = { role: "system", content: systemContent };
    const apiMessages = [systemMessage, ...messages.map((m) => ({ role: m.role, content: m.content }))];

    const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: apiMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("[Chat API] DeepSeek error:", response.status, errorText);
      return NextResponse.json(
        { error: "AI 服务暂时不可用" },
        { status: 502 },
      );
    }

    // Return SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let previousContent = "";
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        let totalTokens = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;

                try {
                  const parsed = JSON.parse(data);
                  const choice = parsed.choices?.[0];

                  // Capture usage from the final chunk (choices is empty, usage present)
                  if (!choice && parsed.usage) {
                    totalPromptTokens = parsed.usage.prompt_tokens || 0;
                    totalCompletionTokens = parsed.usage.completion_tokens || 0;
                    totalTokens = parsed.usage.total_tokens || 0;
                  }

                  const delta = choice?.delta?.content || "";
                  if (delta) {
                    // Some DeepSeek implementations send cumulative content
                    // instead of incremental delta. Extract the actual delta.
                    let actualDelta = delta;
                    if (previousContent && delta.startsWith(previousContent)) {
                      actualDelta = delta.slice(previousContent.length);
                    }
                    previousContent += actualDelta;

                    if (actualDelta) {
                      const payload = `data: ${JSON.stringify({ content: actualDelta })}\n\n`;
                      controller.enqueue(encoder.encode(payload));
                    }
                  }
                } catch {
                  // Skip malformed JSON lines
                }
              }
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("[Chat API] Stream error:", err);
        } finally {
          // Record token usage (fire-and-forget)
          if (totalTokens > 0) {
            prisma.aiUsageLog
              .create({
                data: {
                  type: "chat",
                  promptTokens: totalPromptTokens,
                  completionTokens: totalCompletionTokens,
                  totalTokens,
                },
              })
              .catch((e) =>
                console.error("[Chat API] Failed to record usage:", e),
              );
          }
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[Chat API] Error:", err);
    return NextResponse.json({ error: "请求失败" }, { status: 500 });
  }
}
