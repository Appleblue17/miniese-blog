/**
 * @file auth.ts — Authentication type definitions.
 */

import type { DefaultSession } from "next-auth";

/**
 * User role string literal.
 */
export type UserRole = "user" | "admin";

/**
 * Extended session user with role.
 */
export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: UserRole;
}

/**
 * Extended session type with typed user.
 */
export type AuthSession = DefaultSession & {
  user: SessionUser;
};
