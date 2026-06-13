/**
 * @file /api/admin/settings — Settings API route.
 *
 * GET  /api/admin/settings — Returns current settings
 * PUT  /api/admin/settings — Updates settings
 */

import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "../../../../../config/settings";

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json(settings);
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
