/**
 * @file POST /api/ai/refine-term
 *
 * Lightweight AI endpoint to refine a single term.
 * Used by the create wiki flow's preview step — does NOT create a DB record.
 * Returns the AI's analysis: type, definition, importance.
 *
 * Body: { name: string, language: "zh" | "en" }
 * Response: { type, definition, importance }
 */

import { NextRequest, NextResponse } from "next/server";
import { refineTerm } from "@/lib/ai/refineTerm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, language } = body as { name?: string; language?: string };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "name is required." },
        { status: 400 },
      );
    }

    if (language !== "zh" && language !== "en") {
      return NextResponse.json(
        { error: "language must be 'zh' or 'en'." },
        { status: 400 },
      );
    }

    const result = await refineTerm(name.trim(), language);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Refine term API error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
