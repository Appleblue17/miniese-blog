/**
 * @file create-admin.ts — CLI script to create or update an admin user.
 *
 * Usage:
 *   npm run create-admin -- --email admin@example.com --password mypassword
 *
 * Options:
 *   --email     Admin email (required)
 *   --password  Admin password (required, min 6 chars)
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

async function main() {
  const args = process.argv.slice(2);
  const email = getArg(args, "--email");
  const password = getArg(args, "--password");

  if (!email || !password) {
    console.error("Usage: npm run create-admin -- --email <email> --password <password>");
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("Error: Password must be at least 6 characters");
    process.exit(1);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error("Error: Invalid email format");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        password: hashedPassword,
        roles: ["admin"],
        emailVerified: new Date(),
      },
      create: {
        email,
        password: hashedPassword,
        name: "Admin",
        roles: ["admin"],
        emailVerified: new Date(),
      },
    });

    console.log(`Admin user "${user.email}" (id: ${user.id}) ${user.roles.includes("admin") ? "created/updated" : "created"} successfully.`);
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
