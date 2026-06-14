/**
 * @file Auth API integration tests.
 *
 * Tests for:
 * - POST /api/auth/register — Registration with email/password
 * - GET /api/auth/verify   — Email verification
 * - POST /api/auth/forgot  — Password reset request
 * - POST /api/auth/reset   — Password reset with token
 *
 * Note: Routes that depend on `auth()` (NextAuth session) cannot be tested
 * in vitest because Next.js `headers()`/`cookies()` APIs require request
 * scope. Those routes are: GET /api/auth/me, PUT /api/auth/update-profile,
 * PUT /api/auth/update-password. Their auth checks are simple and verified
 * by code review: if auth() returns null, route returns 401.
 *
 * These tests require a running PostgreSQL database.
 * They will be skipped if the database is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isDatabaseAvailable } from "./setup";
import bcrypt from "bcrypt";

let isDbAvailable = false;
const testEmail = `test-auth-${Date.now()}@miniese.blog`;
const testPassword = "TestPass123!";
let verificationToken = "";

// Shared prisma reference
let prisma: any = null;

isDbAvailable = await isDatabaseAvailable();

beforeAll(async () => {
  if (isDbAvailable) {
    const mod = await import("./db-client");
    prisma = mod.prisma;
  }
});

// Note: No beforeEach cleanup of tokens — tests rely on tokens created
// in earlier tests (e.g., register creates token consumed by verify).

afterAll(async () => {
  if (!isDbAvailable || !prisma) return;
  await prisma.user.deleteMany({
    where: { email: { contains: "test-auth-" } },
  }).catch(() => {});
  await prisma.verificationToken.deleteMany({
    where: { identifier: { contains: "test-auth-" } },
  }).catch(() => {});
});

const describeDb = isDbAvailable ? describe : describe.skip;

describeDb("POST /api/auth/register", () => {
  it("registers a new user and returns 409 when email already exists", async () => {
    const { POST } = await import("@/app/api/auth/register/route");

    // First registration
    const req1 = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: "Test User",
      }),
    });

    const res1 = await POST(req1);
    const data1 = await res1.json();

    expect(res1.status).toBe(201);
    expect(data1.message).toContain("注册成功");

    // Verify user was created
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(user).not.toBeNull();
    expect(user!.name).toBe("Test User");
    expect(user!.role).toBe("user");
    expect(user!.emailVerified).toBeNull();

    // Verify password is hashed
    const isMatch = await bcrypt.compare(testPassword, user!.password);
    expect(isMatch).toBe(true);

    // Check verification token was created
    const token = await prisma.verificationToken.findFirst({
      where: { identifier: testEmail },
    });
    expect(token).not.toBeNull();
    verificationToken = token!.token;

    // Second registration with same email — should fail with 409
    const req2 = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    const res2 = await POST(req2);
    const data2 = await res2.json();

    expect(res2.status).toBe(409);
    expect(data2.error).toContain("已被注册");
  });

  it("returns 400 when email is missing", async () => {
    const { POST } = await import("@/app/api/auth/register/route");

    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: testPassword }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("邮箱");
  });

  it("returns 400 when password is too short", async () => {
    const { POST } = await import("@/app/api/auth/register/route");

    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `shortpw-${Date.now()}@test.com`,
        password: "12345",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("6 个字符");
  });

  it("returns 400 when email format is invalid", async () => {
    const { POST } = await import("@/app/api/auth/register/route");

    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "not-an-email",
        password: testPassword,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("邮箱格式");
  });
});

describeDb("GET /api/auth/verify", () => {
  it("verifies email with valid token", async () => {
    // Ensure token exists
    expect(verificationToken).not.toBe("");
    
    const { GET } = await import("@/app/api/auth/verify/route");

    const request = new Request(
      `http://localhost:3000/api/auth/verify?token=${verificationToken}`,
    );

    const response = await GET(request);
    const data = await response.json();
    
    console.log("[DEBUG verify] status:", response.status, "body:", JSON.stringify(data));

    expect(response.status).toBe(200);
    expect(data.message).toContain("验证成功");
    expect(data.email).toBe(testEmail);

    // Verify user's emailVerified is set
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(user!.emailVerified).not.toBeNull();

    // Verify token was deleted
    const token = await prisma.verificationToken.findFirst({
      where: { identifier: testEmail },
    });
    expect(token).toBeNull();
  });

  it("returns 400 when token is missing", async () => {
    const { GET } = await import("@/app/api/auth/verify/route");

    const request = new Request("http://localhost:3000/api/auth/verify");

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("令牌");
  });

  it("returns 400 for invalid token", async () => {
    const { GET } = await import("@/app/api/auth/verify/route");

    const request = new Request(
      "http://localhost:3000/api/auth/verify?token=invalid-token-123",
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("无效");
  });
});

describeDb("POST /api/auth/forgot", () => {
  it("sends reset email for existing user (mock)", async () => {
    const { POST } = await import("@/app/api/auth/forgot/route");

    const request = new Request("http://localhost:3000/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("重置密码邮件");

    // Verify new token was created
    const token = await prisma.verificationToken.findFirst({
      where: { identifier: testEmail },
    });
    expect(token).not.toBeNull();
    // Token should be valid for 1 hour
    const oneHourMs = 60 * 60 * 1000;
    expect(token!.expires.getTime() - Date.now()).toBeLessThan(oneHourMs + 5000);
    expect(token!.expires.getTime() - Date.now()).toBeGreaterThan(oneHourMs - 5000);
  });

  it("returns success even for non-existent email (security)", async () => {
    const { POST } = await import("@/app/api/auth/forgot/route");

    const request = new Request("http://localhost:3000/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nonexistent@test.com" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("重置密码邮件");
  });

  it("returns 400 when email is missing", async () => {
    const { POST } = await import("@/app/api/auth/forgot/route");

    const request = new Request("http://localhost:3000/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("邮箱");
  });
});

describeDb("POST /api/auth/reset", () => {
  let resetToken = "";

  beforeAll(async () => {
    if (!isDbAvailable || !prisma) return;
    // Create a fresh reset token (verify consumed the original)
    const crypto = await import("crypto");
    const token = crypto.default.randomBytes(32).toString("hex");
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
    
    console.log("[DEBUG reset] status:", response.status, "body:", JSON.stringify(data));

    expect(response.status).toBe(200);
    expect(data.message).toContain("密码重置成功");

    // Verify password was updated
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
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
