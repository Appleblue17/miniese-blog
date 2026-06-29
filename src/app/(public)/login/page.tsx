/**
 * @file Login page — /login
 *
 * Provides email + password login and OAuth buttons.
 * Redirects to previous page (or homepage) if already logged in.
 * Non-admin users now default to homepage instead of /admin.
 */

"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false);

  // Extract language from path
  const lang = typeof window !== "undefined"
    ? window.location.pathname.match(/^\/(zh|en)/)?.[1] || "zh"
    : "zh";

  // Check if already logged in
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setAlreadyLoggedIn(true);
          // Short delay so the message is visible before redirect
          setTimeout(() => {
            window.location.href = callbackUrl;
          }, 500);
        }
      })
      .catch(() => {});
  }, [callbackUrl]);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setMessage("邮箱或密码错误");
      setLoading(false);
      return;
    }

    window.location.href = callbackUrl;
  };

  const handleOAuthLogin = (provider: string) => {
    signIn(provider, { callbackUrl });
  };

  // Show a message if already logged in
  if (alreadyLoggedIn) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold">已登录</h1>
          <p className="text-sm text-muted-foreground">
            您已登录，正在跳转...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">登录</h1>
          <p className="text-sm text-muted-foreground mt-1">
            登录以评论、申请词条和管理内容
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3 text-sm text-red-600 dark:text-red-400">
            登录失败，请重试
          </div>
        )}

        {message && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3 text-sm text-red-600 dark:text-red-400">
            {message}
          </div>
        )}

        <form onSubmit={handleCredentialsLogin} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-1"
            >
              邮箱
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1"
            >
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary-hsl opacity-90 text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        {/* OAuth buttons */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs text-muted-foreground">
            <span className="px-2">{lang === "zh" ? "或" : "or"}</span>
          </div>
        </div>

        <div className="space-y-2">
          {process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true" && (
            <button
              onClick={() => handleOAuthLogin("google")}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent/50 transition-colors"
            >
              使用 Google 登录
            </button>
          )}
          {process.env.NEXT_PUBLIC_GITHUB_ENABLED === "true" && (
            <button
              onClick={() => handleOAuthLogin("github")}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent/50 transition-colors"
            >
              使用 GitHub 登录
            </button>
          )}
        </div>

        <div className="text-center text-sm text-muted-foreground space-x-4">
          <Link
            href="/register"
            className="underline hover:text-foreground transition-colors"
          >
            注册
          </Link>
          <Link
            href="/forgot"
            className="underline hover:text-foreground transition-colors"
          >
            忘记密码
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
