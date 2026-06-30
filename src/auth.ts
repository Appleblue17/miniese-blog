/**
 * @file auth.ts — NextAuth (Auth.js) v5 configuration.
 *
 * Supports:
 * - Credentials (username/email + password) login
 * - Google OAuth (optional, requires GOOGLE_CLIENT_* env vars)
 * - GitHub OAuth (optional, requires GITHUB_CLIENT_* env vars)
 * - Prisma adapter for database-backed users/sessions/accounts
 *
 * Email is optional — users register with username + password.
 * Email can be added later via OAuth binding.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "用户名/邮箱", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const login = credentials.username as string;

        // Try to find user by username first, then by email
        let user = await prisma.user.findUnique({
          where: { username: login },
        });

        if (!user) {
          // Try email lookup (email is optional but some users may have it)
          user = await prisma.user.findUnique({
            where: { email: login },
          });
        }

        if (!user || !user.password) return null;

        const passwordValid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );
        if (!passwordValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          roles: user.roles,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
    ...(process.env.GITHUB_CLIENT_ID
      ? [
          GitHub({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.roles = (user as { roles?: string[] }).roles || ["user"];
        token.id = user.id;
        token.username = (user as { username?: string }).username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { roles: string[] }).roles = (token.roles as string[]) || ["user"];
        (session.user as { id: string }).id = token.id as string;
        (session.user as { username?: string }).username = token.username as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET!,
});

/**
 * Extend the built-in session types to include roles, id and username.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      username?: string;
      roles: string[];
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    roles: string[];
    id?: string;
    username?: string;
  }
}
