/**
 * @file Settings page — /settings
 *
 * User settings: modify password, nickname, view OAuth accounts.
 * Requires authentication.
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface UserInfo {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

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
            <span className="text-muted-foreground">邮箱：</span>
            {user.email}
          </p>
          <p>
            <span className="text-muted-foreground">角色：</span>
            {user.role === "admin" ? "管理员" : "用户"}
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
          <p className="text-sm text-green-600 dark:text-green-400">{nameMessage}</p>
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

      {/* Admin link */}
      {user.role === "admin" && (
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
