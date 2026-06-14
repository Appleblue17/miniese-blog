/**
 * @file NextAuth API route handler.
 *
 * Handles all auth endpoints under /api/auth/*:
 * - /api/auth/signin
 * - /api/auth/signout
 * - /api/auth/callback/*
 * - /api/auth/session
 * - /api/auth/csrf
 * - /api/auth/providers
 * - /api/auth/verify-request
 */

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
