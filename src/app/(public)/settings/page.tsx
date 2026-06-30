/**
 * @file Settings page — /settings
 *
 * User settings: modify username, nickname, password, manage OAuth accounts.
 * Requires authentication.
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

interface UserInfo {
  id: string;
  name: string | null;
  email: string | null;
  username?: string;
  roles: string[];
}

interface OAuthAccount {
  provider: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
};

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile
  const [name, setName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState("");

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  // OAuth
  const [oauthAccounts, setOauthAccounts] = useState<OAuthAccount[]>([]);
  const [oauthLoading, setOauthLoading] = useState(true);
  const [oauthMessage, setOauthMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) {
          router.push("/login?callbackUrl=/settings");
          return;
        }
        setUser(data.user);
        setName(data.user.name || "");
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  // Fetch OAuth accounts
  useEffect(() => {
    if (!user) return;
    fetch("/api/auth/oauth/accounts")
      .then((r) => r.json())
      .then((data) => {
        setOauthAccounts(data.accounts || []);
      })
      .catch(() => {})
      .finally(() => setOauthLoading(false));
  }, [user]);

  const handleNameUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameSaving(true);
    setNameMessage("");

    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        setNameMessage("昵称已更新");
      } else {
        setNameMessage(data.error || "更新失败");
      }
    } catch {
      setNameMessage("网络错误");
    } finally {
      setNameSaving(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMessage("两次输入的密码不一致");
      return;
    }
    setPasswordSaving(true);
    setPasswordMessage("");

    try {
      const res = await fetch("/api/auth/update-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordMessage("密码已更新");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordMessage(data.error || "更新失败");
      }
    } catch {
      setPasswordMessage("网络错误");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleLinkOAuth = (provider: string) => {
    signIn(provider, { callbackUrl: "/settings" });
  };

  const handleUnlinkOAuth = async (provider: string) => {
    if (!confirm(`确定解绑 ${PROVIDER_LABELS[provider] || provider} 账号？`)) return;

    setOauthMessage("");
    try {
      const res = await fetch("/api/auth/oauth/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (res.ok) {
        setOauthAccounts((prev) => prev.filter((a) => a.provider !== provider));
        setOauthMessage("解绑成功");
      } else {
        setOauthMessage(data.error || "解绑失败");
      }
    } catch {
      setOauthMessage("网络错误");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-spin size-8 border-2 border-foreground border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">个人设置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理您的账号信息
        </p>
      </div>

      {/* Profile Info */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-lg font-semibold">基本信息</h2>
        <div className="text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">用户名：</span>
            {user.username || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">邮箱：</span>
            {user.email || "未绑定（可通过 OAuth 绑定）"}
          </p>
          <p>
            <span className="text-muted-foreground">角色：</span>
            {user.roles.includes("admin") ? "管理员" : "用户"}
          </p>
        </div>
      </div>

      {/* Update Name */}
      <form onSubmit={handleNameUpdate} className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-lg font-semibold">修改昵称</h2>
        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            placeholder="你的昵称"
          />
        </div>
        {nameMessage && (
          <p className={`text-sm ${nameMessage.includes("已更新") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {nameMessage}
          </p>
        )}
        <button
          type="submit"
          disabled={nameSaving}
          className="rounded-lg bg-foreground text-background px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {nameSaving ? "保存中..." : "保存"}
        </button>
      </form>

      {/* Update Password */}
      <form onSubmit={handlePasswordUpdate} className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-lg font-semibold">修改密码</h2>
        <div>
          <label className="block text-sm font-medium mb-1">当前密码</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">新密码</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            required
            minLength={6}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">确认新密码</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            required
            minLength={6}
          />
        </div>
        {passwordMessage && (
          <p className={`text-sm ${passwordMessage.includes("已更新") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {passwordMessage}
          </p>
        )}
        <button
          type="submit"
          disabled={passwordSaving}
          className="rounded-lg bg-foreground text-background px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {passwordSaving ? "更新中..." : "更新密码"}
        </button>
      </form>

      {/* OAuth Accounts */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-lg font-semibold">OAuth 账号绑定</h2>
        <p className="text-xs text-muted-foreground">
          绑定 OAuth 账号后，您可以使用邮箱找回密码，并简化登录流程。
        </p>

        {oauthLoading ? (
          <div className="text-sm text-muted-foreground">加载中...</div>
        ) : (
          <div className="space-y-2">
            {["google", "github"].map((provider) => {
              const linked = oauthAccounts.find((a) => a.provider === provider);
              const label = PROVIDER_LABELS[provider] || provider;
              return (
                <div
                  key={provider}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <span className="text-sm font-medium">{label}</span>
                  {linked ? (
                    <button
                      onClick={() => handleUnlinkOAuth(provider)}
                      className="text-xs text-red-500 hover:text-red-600 transition-colors"
                    >
                      解绑
                    </button>
                  ) : (
                    <button
                      onClick={() => handleLinkOAuth(provider)}
                      className="text-xs text-primary hover:opacity-80 transition-opacity"
                    >
                      绑定
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {oauthMessage && (
          <p className={`text-sm ${oauthMessage.includes("成功") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {oauthMessage}
          </p>
        )}
      </div>

      {/* Admin link */}
      {user.roles.includes("admin") && (
        <div className="text-center">
          <Link
            href="/admin"
            className="text-sm text-muted-foreground underline hover:text-foreground transition-colors"
          >
            前往仪表盘
          </Link>
        </div>
      )}
    </div>
  );
}
