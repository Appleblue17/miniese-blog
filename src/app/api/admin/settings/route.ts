/**
 * @file /api/admin/settings — Settings API route.
 *
 * GET  /api/admin/settings — Returns current settings (merged) + default prompts
 * PUT  /api/admin/settings — Updates settings
 */

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getSettings, updateSettings } from "../../../../../config/settings";

export async function GET() {
  try {
    const [settings, defaultContent] = await Promise.all([
      getSettings(),
      fs.readFile(path.join(process.cwd(), "config/default-settings.json"), "utf-8"),
    ]);
    const defaultSettings = JSON.parse(defaultContent) as Record<string, unknown>;
    const defaultPrompts = (defaultSettings.prompts as Record<string, string>) || {};
    const defaultMailTemplates = (defaultSettings.mailTemplates as Record<string, string>) || {};

    return NextResponse.json({ ...settings, defaultPrompts, defaultMailTemplates });
  } catch (err) {
    console.error("[Settings API] GET error:", err);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const settings = await updateSettings(body);
    return NextResponse.json(settings);
  } catch (err) {
    console.error("[Settings API] PUT error:", err);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
