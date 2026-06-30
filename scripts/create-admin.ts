/**
 * @file create-admin.ts — CLI script to create or update an admin user.
 *
 * Usage:
 *   npm run create-admin -- --username admin --password mypassword
 *
 * Options:
 *   --username   Admin username (required, alphanumeric/hyphen/underscore, 2-32 chars)
 *   --password   Admin password (required, min 6 chars)
 *   --email      Admin email (optional, for password recovery via OAuth)
 *   --name       Display name (optional, defaults to username)
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

async function main() {
  const args = process.argv.slice(2);
  const username = getArg(args, "--username") || getArg(args, "-u");
  const password = getArg(args, "--password") || getArg(args, "-p");
  const email = getArg(args, "--email");
  const name = getArg(args, "--name") || getArg(args, "-n");

  if (!username || !password) {
    console.error("Usage: npm run create-admin -- --username <username> --password <password> [--email <email>]");
    console.error("  --username / -u   Admin username (required)");
    console.error("  --password / -p   Admin password (required, min 6 chars)");
    console.error("  --email           Admin email (optional)");
    console.error("  --name / -n       Display name (optional, defaults to username)");
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("Error: Password must be at least 6 characters");
    process.exit(1);
  }

  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(username)) {
    console.error("Error: Username must be 2-32 characters, alphanumeric/hyphen/underscore only");
    process.exit(1);
  }

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error("Error: Invalid email format");
      process.exit(1);
    }
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.upsert({
      where: { username },
      update: {
        password: hashedPassword,
        roles: ["admin"],
        ...(email ? { email } : {}),
        name: name || username,
      },
      create: {
        username,
        password: hashedPassword,
        name: name || username,
        roles: ["admin"],
        ...(email ? { email, emailVerified: new Date() } : {}),
      },
    });

    const parts = [`Admin user "${user.username}" (id: ${user.id})`];
    if (user.email) parts.push(`email: ${user.email}`);
    parts.push(user.roles.includes("admin") ? "created/updated successfully." : "created.");
    console.log(parts.join(", "));
  } catch (err) {
    console.error("Error creating admin user:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

function getArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

main();
