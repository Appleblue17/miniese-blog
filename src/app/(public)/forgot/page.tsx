/**
 * @file Forgot password page — /forgot
 *
 * Username or email input to request a password reset link.
 * Only works for users who have bound an OAuth account.
 */

"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPage() {
  const [login, setLogin] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [noEmail, setNoEmail] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNoEmail(false);

    try {
      // Determine if input looks like an email
      const isEmail = login.includes("@");
      const body = isEmail ? { email: login } : { username: login };

      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "发送失败");
        setLoading(false);
        return;
      }

      if (data.noEmail) {
        setNoEmail(true);
      }
      setSent(true);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">忘记密码</h1>
          <p className="text-sm text-muted-foreground mt-1">
            输入用户名或绑定的邮箱，我们将发送重置链接
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {sent ? (
          <div className={`rounded-lg border p-4 text-sm space-y-3 ${
            noEmail
              ? "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400"
              : "border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 text-green-600 dark:text-green-400"
          }`}>
            {noEmail ? (
              <>
                <p>该用户未绑定邮箱，无法发送重置邮件。</p>
                <p className="text-xs">请联系管理员为您重置密码。</p>
              </>
            ) : (
              <>
                <p>如果该用户已绑定邮箱，您将收到重置密码邮件。</p>
                <p className="text-xs">请检查您的收件箱（包括垃圾邮件）。</p>
              </>
            )}
            <Link
              href="/login"
              className="block text-center rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              返回登录
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login" className="block text-sm font-medium mb-1">
                用户名或邮箱
              </label>
              <input
                id="login"
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="用户名或绑定的邮箱"
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "发送中..." : "发送重置链接"}
            </button>
          </form>
        )}

        <div className="text-center text-sm space-y-2">
          <div>
            <Link
              href="/login"
              className="text-muted-foreground underline hover:text-foreground transition-colors"
            >
              返回登录
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            未绑定邮箱的用户请联系管理员重置密码
          </p>
        </div>
      </div>
    </div>
  );
}
