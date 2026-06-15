/**
 * @file GET /api/auth/me — Get current user session.
 *
 * Returns the current user info if logged in, or null if not.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      roles: (session.user as { roles?: string[] }).roles || ["user"],
    },
  });
}
