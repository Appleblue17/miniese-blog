/**
 * @file Verify email page — /verify?token=xxx
 *
 * Automatically verifies the email and shows the result.
 */

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type VerifyState = "loading" | "success" | "error";

function VerifyForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<VerifyState>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("缺少验证令牌");
      return;
    }

    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setState("error");
          setMessage(data.error);
        } else {
          setState("success");
          setMessage("邮箱验证成功！");
        }
      })
      .catch(() => {
        setState("error");
        setMessage("验证失败，请稍后重试");
      });
  }, [token]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        {state === "loading" && (
          <div className="space-y-3">
            <div className="animate-spin size-8 border-2 border-foreground border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-muted-foreground">正在验证...</p>
          </div>
        )}

        {state === "success" && (
          <div className="space-y-4">
            <div className="size-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <svg className="size-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold">{message}</h1>
            <Link
              href="/login"
              className="inline-block rounded-lg bg-foreground text-background px-6 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              前往登录
            </Link>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-4">
            <div className="size-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
              <svg className="size-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-bold">验证失败</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Link
              href="/login"
              className="inline-block rounded-lg border border-input px-6 py-2 text-sm font-medium hover:bg-accent/50 transition-colors"
            >
              返回登录
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    }>
      <VerifyForm />
    </Suspense>
  );
}
