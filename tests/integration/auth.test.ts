/**
 * @file Auth API integration tests.
 *
 * Tests for:
 * - POST /api/auth/register — Registration with username/password (no email)
 * - POST /api/auth/forgot   — Password reset request (only for users with email)
 * - POST /api/auth/reset    — Password reset with token
 * - GET  /api/auth/verify   — Email verification (backward compat)
 *
 * Note: Routes that depend on `auth()` (NextAuth session) cannot be tested
 * in vitest because Next.js `headers()`/`cookies()` APIs require request
 * scope. Those routes are: GET /api/auth/me, PUT /api/auth/update-profile,
 * PUT /api/auth/update-password, OAuth bind/unbind.
 *
 * These tests require a running PostgreSQL database.
 * They will be skipped if the database is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isDatabaseAvailable } from "./setup";
import bcrypt from "bcrypt";

let isDbAvailable = false;
const testUsername = `test-auth-${Date.now()}`;
const testPassword = "TestPass123!";

// Shared prisma reference
let prisma: any = null;

isDbAvailable = await isDatabaseAvailable();

beforeAll(async () => {
  if (isDbAvailable) {
    const mod = await import("./db-client");
    prisma = mod.prisma;
  }
});

afterAll(async () => {
  if (!isDbAvailable || !prisma) return;
  await prisma.user.deleteMany({
    where: { username: { contains: "test-auth-" } },
  }).catch(() => {});
  await prisma.verificationToken.deleteMany({
    where: { identifier: { contains: "test-auth-" } },
  }).catch(() => {});
});

const describeDb = isDbAvailable ? describe : describe.skip;

describeDb("POST /api/auth/register", () => {
  it("registers a new user with username and password", async () => {
    const { POST } = await import("@/app/api/auth/register/route");

    const req1 = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUsername,
        password: testPassword,
        name: "Test User",
      }),
    });

    const res1 = await POST(req1);
    const data1 = await res1.json();

    expect(res1.status).toBe(201);
    expect(data1.message).toContain("注册成功");
    expect(data1.username).toBe(testUsername);

    // Verify user was created
    const user = await prisma.user.findUnique({ where: { username: testUsername } });
    expect(user).not.toBeNull();
    expect(user!.name).toBe("Test User");
    expect(user!.roles).toContain("user");
    expect(user!.email).toBeNull(); // No email required
    expect(user!.emailVerified).toBeNull();

    // Verify password is hashed
    const isMatch = await bcrypt.compare(testPassword, user!.password);
    expect(isMatch).toBe(true);
  });

  it("returns 409 when username already exists", async () => {
    const { POST } = await import("@/app/api/auth/register/route");

    const req = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUsername,
        password: testPassword,
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toContain("已被使用");
  });

  it("returns 400 when username is missing", async () => {
    const { POST } = await import("@/app/api/auth/register/route");

    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: testPassword }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("用户名");
  });

  it("returns 400 when password is too short", async () => {
    const { POST } = await import("@/app/api/auth/register/route");

    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `shortpw-${Date.now()}`,
        password: "12345",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("6 个字符");
  });

  it("returns 400 when username format is invalid", async () => {
    const { POST } = await import("@/app/api/auth/register/route");

    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "a", // too short (min 2)
        password: testPassword,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("用户名");
  });

  it("returns 400 when username has special characters", async () => {
    const { POST } = await import("@/app/api/auth/register/route");

    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "user@name!",
        password: testPassword,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("用户名");
  });

  it("does NOT create a verification token (email is optional)", async () => {
    // Verify no verification token was created for the user
    const tokens = await prisma.verificationToken.findMany({
      where: { identifier: { contains: testUsername } },
    });
    expect(tokens).toHaveLength(0);
  });
});

describeDb("POST /api/auth/forgot", () => {
  it("returns noEmail flag when user has no email (no token created)", async () => {
    const { POST } = await import("@/app/api/auth/forgot/route");

    // User registered without email
    const request = new Request("http://localhost:3000/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: testUsername }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.noEmail).toBe(true);
    expect(data.message).toContain("未找到");

    // No verification token should be created since user has no email
    const tokens = await prisma.verificationToken.findMany({
      where: { identifier: { contains: testUsername } },
    });
    expect(tokens).toHaveLength(0);
  });

  it("sends reset email for user with email", async () => {
    // Add email to test user
    const testEmail = `${testUsername}@test.com`;
    await prisma.user.update({
      where: { username: testUsername },
      data: { email: testEmail },
    });

    const { POST } = await import("@/app/api/auth/forgot/route");

    const request = new Request("http://localhost:3000/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: testUsername }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("重置密码邮件");

    // Verify token was created
    const token = await prisma.verificationToken.findFirst({
      where: { identifier: testEmail },
    });
    expect(token).not.toBeNull();
    const oneHourMs = 60 * 60 * 1000;
    expect(token!.expires.getTime() - Date.now()).toBeLessThan(oneHourMs + 5000);
    expect(token!.expires.getTime() - Date.now()).toBeGreaterThan(oneHourMs - 5000);
  });

  it("returns noEmail for non-existent user (security)", async () => {
    const { POST } = await import("@/app/api/auth/forgot/route");

    const request = new Request("http://localhost:3000/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nonexistent-user" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.noEmail).toBe(true);
    expect(data.message).toContain("未找到");
  });

  it("returns 400 when login is missing", async () => {
    const { POST } = await import("@/app/api/auth/forgot/route");

    const request = new Request("http://localhost:3000/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("用户名或邮箱");
  });
});

describeDb("POST /api/auth/reset", () => {
  let resetToken = "";

  beforeAll(async () => {
    if (!isDbAvailable || !prisma) return;
    // Create a fresh reset token for the test user
    const crypto = await import("crypto");
    const token = crypto.default.randomBytes(32).toString("hex");
    const testEmail = `${testUsername}@test.com`;
    await prisma.verificationToken.create({
      data: {
        identifier: testEmail,
        token,
        expires: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    resetToken = token;
  });

  it("resets password with valid token", async () => {
    expect(resetToken).not.toBe("");

    const newPassword = "NewPass456!";
    const { POST } = await import("@/app/api/auth/reset/route");

    const request = new Request("http://localhost:3000/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken, password: newPassword }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("密码重置成功");

    // Verify password was updated
    const user = await prisma.user.findUnique({ where: { username: testUsername } });
    const isMatch = await bcrypt.compare(newPassword, user!.password);
    expect(isMatch).toBe(true);

    // Verify old password no longer works
    const oldMatch = await bcrypt.compare(testPassword, user!.password);
    expect(oldMatch).toBe(false);

    // Token should be deleted
    const tokenRecord = await prisma.verificationToken.findUnique({
      where: { token: resetToken },
    });
    expect(tokenRecord).toBeNull();
  });

  it("returns 400 with invalid token", async () => {
    const { POST } = await import("@/app/api/auth/reset/route");

    const request = new Request("http://localhost:3000/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invalid-token", password: "NewPass789!" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("令牌无效");
  });

  it("returns 400 when password is too short", async () => {
    const { POST } = await import("@/app/api/auth/reset/route");

    const request = new Request("http://localhost:3000/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "some-token", password: "12345" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("6 个字符");
  });

  it("returns 400 when token is missing", async () => {
    const { POST } = await import("@/app/api/auth/reset/route");

    const request = new Request("http://localhost:3000/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "NewPass789!" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("令牌");
  });
});
