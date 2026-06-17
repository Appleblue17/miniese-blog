/**
 * @file /admin/settings — Site settings page.
 *
 * Client component with Tab layout:
 * - 常规: site title, description, pagination
 * - 外观: theme, width, layout, hue pickers, background
 * - 功能开关: feature toggles
 * - 通知: email notification settings
 * - 高级: compiler list, prompt templates (read-only)
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Settings2,
  Palette,
  ToggleLeft,
  Bell,
  Bug,
  Terminal,
  Loader2,
  Check,
  AlertCircle,
  Sun,
  Moon,
  Monitor,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import type { AppSettings } from "../../../../../config/settings";

// Default hardcoded settings (prompts are loaded from default-settings.json via API)
const DEFAULT_SETTINGS: AppSettings = {
  site: { title: "Miniese's Blog", description: "个人技术博客与知识库", headerTitle: "Miniese's Blog", heroTitle: "Miniese's Blog", heroSubtitles: ["探索技术与知识的边界", "记录思考与成长的点滴", "AI 驱动的写作与知识管理"], heroSubtitlesEn: ["Exploring the frontiers of tech & knowledge", "Documenting thoughts and growth", "AI-powered writing & knowledge management"], heroSubtitleMode: "sequential", heroSubtitleIntervalMs: 5000, heroImageLight: "/images/miniese/hero/hero-light.png", heroImageDark: "/images/miniese/hero/hero-dark.png" },
  pagination: { articlesPerPage: 10, wikiPerPage: 20 },
  appearance: {
    themeMode: "system", bodyWidth: 66, image: { maxWidth: 800, maxHeight: 600, defaultWidthRatio: 60, lightboxEnabled: true, captionIgnoreList: ["alt text"] },
    primary: { lightHue: 200, darkHue: 260, lightSaturation: 70, darkSaturation: 70, lightLightness: 55, darkLightness: 65 },
    accent: { lightHue: 280, darkHue: 280, lightSaturation: 70, darkSaturation: 70, lightLightness: 55, darkLightness: 65 },
    backgroundImage: "", backgroundOpacity: 10, markdownBgOpacity: 80,
    markdownTextColorLight: "#1f2328", markdownTextColorDark: "#f0f6fc",
    markdownBgColorLight: "#ffffff", markdownBgColorDark: "#0d1117",
  },
  features: { aiReview: true, autoTranslate: true, wikiDiscovery: true, wikiGenerate: true, comments: true, rss: true },
  notifications: { email: true, adminEmail: "", onComment: true, onDiscovery: true, onTranslate: true },
  compilers: {
    markdown: { name: "Markdown", extensions: [".md"], enabled: true },
    notesaw: { name: "Notesaw", extensions: [".md"], enabled: true },
  },
  publish: { defaultAuthor: "博主" },
  prompts: { review: "", translate: "", discovery: "", generate: "", chat: "" },
};

type TabId = "general" | "appearance" | "features" | "notifications" | "dev" | "advanced";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "常规", icon: <Settings2 className="size-4" /> },
  { id: "appearance", label: "外观", icon: <Palette className="size-4" /> },
  { id: "features", label: "功能开关", icon: <ToggleLeft className="size-4" /> },
  { id: "notifications", label: "通知", icon: <Bell className="size-4" /> },
  { id: "dev", label: "开发", icon: <Bug className="size-4" /> },
  { id: "advanced", label: "高级", icon: <Terminal className="size-4" /> },
];

const THEME_OPTIONS: { value: string; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "浅色", icon: <Sun className="size-4" /> },
  { value: "dark", label: "深色", icon: <Moon className="size-4" /> },
  { value: "system", label: "跟随系统", icon: <Monitor className="size-4" /> },
];

function HueSlider({
  label,
  value,
  onChange,
  hue,
  sat = 70,
  light = 55,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hue: number;
  sat?: number;
  light?: number;
}) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={360}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-foreground"
        />
        <div
          className="size-8 shrink-0 rounded border"
          style={{ backgroundColor: `hsl(${hue}, ${sat}%, ${light}%)` }}
        />
        <span className="text-xs text-muted-foreground w-10 tabular-nums">{value}°</span>
      </div>
    </div>
  );
}

function SatLightSlider({
  label,
  value,
  onChange,
  hue,
  sat = 70,
  isLightness,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hue: number;
  sat?: number;
  isLightness?: boolean;
}) {
  const percentLabel = isLightness ? "亮度" : "饱和度";
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={10}
          max={isLightness ? 90 : 100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-foreground"
        />
        <div
          className="size-8 shrink-0 rounded border"
          style={{
            backgroundColor: isLightness
              ? `hsl(${hue}, ${sat}%, ${value}%)`
              : `hsl(${hue}, ${value}%, 55%)`,
          }}
        />
        <span className="text-xs text-muted-foreground w-10 tabular-nums">{value}%</span>
      </div>
    </div>
  );
}

function PercentSlider({
  label,
  value,
  onChange,
  displayColor,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  displayColor?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-foreground"
        />
        {displayColor && (
          <div
            className="size-8 shrink-0 rounded border"
            style={{ backgroundColor: displayColor }}
          />
        )}
        <span className="text-xs text-muted-foreground w-10 tabular-nums">{value}%</span>
      </div>
    </div>
  );
}
// (Removed duplicate HueSlider)

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold mb-4 pb-2 border-b border-border">{children}</h3>;
}

/**
 * A small "恢复默认" button that appears when the current value differs from the default.
 * Clicking it resets the field to the default value.
 */
function ResetButton({
  isDefault,
  onReset,
}: {
  isDefault: boolean;
  onReset: () => void;
}) {
  if (isDefault) return null;
  return (
    <button
      type="button"
      onClick={onReset}
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      title="恢复默认值"
    >
      <Undo2 className="size-3" />
      恢复默认
    </button>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("general");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  // Local copy for editing
  const [local, setLocal] = useState<AppSettings | null>(null);
  // Default prompts from default-settings.json (used for "恢复默认")
  const [defaultPrompts, setDefaultPrompts] = useState<Record<string, string> | null>(null);
  const { setTheme } = useTheme();

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data: AppSettings & { defaultPrompts?: Record<string, string> }) => {
        // Strip defaultPrompts from the settings object
        const { defaultPrompts: dp, ...settingsOnly } = data;
        setSettings(settingsOnly as AppSettings);
        setLocal(JSON.parse(JSON.stringify(settingsOnly)) as AppSettings);
        if (dp) setDefaultPrompts(dp);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Sync CSS variables with local appearance
  useEffect(() => {
    if (!local) return;
    const a = local.appearance;

    // Detect if we should use dark mode hues
    const isDark =
      a.themeMode === "dark" ||
      (a.themeMode === "system" &&
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const primaryHue = isDark ? a.primary.darkHue : a.primary.lightHue;
    const accentHue = isDark ? a.accent.darkHue : a.accent.lightHue;
    const primarySat = isDark ? a.primary.darkSaturation : a.primary.lightSaturation;
    const accentSat = isDark ? a.accent.darkSaturation : a.accent.lightSaturation;
    const primaryLight = isDark ? a.primary.darkLightness : a.primary.lightLightness;
    const accentLight = isDark ? a.accent.darkLightness : a.accent.lightLightness;
    const primaryDark = Math.max(primaryLight - 20, 10);
    const primaryLightest = Math.min(primaryLight + 20, 90);
    const accentDark = Math.max(accentLight - 20, 10);
    const accentLightest = Math.min(accentLight + 20, 90);

    document.documentElement.style.setProperty("--primary-hue", String(primaryHue));
    document.documentElement.style.setProperty("--accent-hue", String(accentHue));
    document.documentElement.style.setProperty("--primary-sat", `${primarySat}%`);
    document.documentElement.style.setProperty("--accent-sat", `${accentSat}%`);
    document.documentElement.style.setProperty("--primary-lightness", `${primaryLight}%`);
    document.documentElement.style.setProperty("--accent-lightness", `${accentLight}%`);
    document.documentElement.style.setProperty("--primary-light", `${primaryLight}%`);
    document.documentElement.style.setProperty("--primary-dark", `${primaryDark}%`);
    document.documentElement.style.setProperty("--primary-lightest", `${primaryLightest}%`);
    document.documentElement.style.setProperty("--accent-light", `${accentLight}%`);
    document.documentElement.style.setProperty("--accent-light-dark", `${accentDark}%`);
    document.documentElement.style.setProperty("--accent-light-lightest", `${accentLightest}%`);

    // Sync body width
    document.documentElement.style.setProperty("--body-width", `${a.bodyWidth}rem`);

    // Sync markdown text color based on current theme mode
    const textColor = isDark ? (a.markdownTextColorDark ?? "#f0f6fc") : (a.markdownTextColorLight ?? "#1f2328");
    document.documentElement.style.setProperty("--markdown-text-color", textColor);

    // Sync markdown bg color based on current theme mode
    const bgColor = isDark ? (a.markdownBgColorDark ?? "#0d1117") : (a.markdownBgColorLight ?? "#ffffff");
    document.documentElement.style.setProperty("--markdown-bg-color-global", bgColor);

    // Sync markdown bg opacity
    document.documentElement.style.setProperty("--markdown-bg-opacity", `${a.markdownBgOpacity}%`);

    // Sync image settings
    const img = a.image ?? {};
    document.documentElement.style.setProperty("--image-max-width", `${img.maxWidth ?? 800}px`);
    document.documentElement.style.setProperty("--image-width-ratio", `${img.defaultWidthRatio ?? 60}%`);
  }, [local?.appearance]);

  const updateLocal = useCallback(
    <K extends keyof AppSettings>(section: K, key: string, value: unknown) => {
      if (!local) return;
      setLocal((prev) => {
        if (!prev) return prev;
        const copy = JSON.parse(JSON.stringify(prev)) as AppSettings;
        (copy[section] as Record<string, unknown>)[key] = value;
        return copy;
      });
    },
    [local],
  );

  const resetField = useCallback(
    <K extends keyof AppSettings>(section: K, key: string) => {
      if (!local) return;
      const defaultValue = (DEFAULT_SETTINGS[section] as Record<string, unknown>)[key];
      setLocal((prev) => {
        if (!prev) return prev;
        const copy = JSON.parse(JSON.stringify(prev)) as AppSettings;
        (copy[section] as Record<string, unknown>)[key] = defaultValue;
        return copy;
      });
    },
    [local],
  );

  const handleSave = async () => {
    if (!local) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated = (await res.json()) as AppSettings;
      setSettings(updated);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!local) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center text-muted-foreground">
        无法加载设置
      </div>
    );
  }

  const a = local.appearance;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="inline-flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">站点设置</h1>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === "success" && (
            <span className="inline-flex items-center gap-1 text-sm text-green-600">
              <Check className="size-4" /> 已保存
            </span>
          )}
          {saveStatus === "error" && (
            <span className="inline-flex items-center gap-1 text-sm text-destructive">
              <AlertCircle className="size-4" /> 保存失败
            </span>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存设置
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-8 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-8">
        {/* ===== General ===== */}
        {tab === "general" && (
          <div className="space-y-6 max-w-lg">
            <SectionHeading>站点信息</SectionHeading>

            <div>
              <label className="text-sm font-medium block mb-1">站点标题</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={local.site.title}
                  onChange={(e) => updateLocal("site", "title", e.target.value)}
                  className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                />
                <ResetButton
                  isDefault={local.site.title === DEFAULT_SETTINGS.site.title}
                  onReset={() => resetField("site", "title")}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">站点描述</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={local.site.description}
                  onChange={(e) => updateLocal("site", "description", e.target.value)}
                  className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                />
                <ResetButton
                  isDefault={local.site.description === DEFAULT_SETTINGS.site.description}
                  onReset={() => resetField("site", "description")}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">头部标题</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={local.site.headerTitle}
                  onChange={(e) => updateLocal("site", "headerTitle", e.target.value)}
                  className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                />
                <ResetButton
                  isDefault={local.site.headerTitle === DEFAULT_SETTINGS.site.headerTitle}
                  onReset={() => resetField("site", "headerTitle")}
                />
              </div>
            </div>

            <SectionHeading>Hero 区设置</SectionHeading>

            <div>
              <label className="text-sm font-medium block mb-1">主标题</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={local.site.heroTitle}
                  onChange={(e) => updateLocal("site", "heroTitle", e.target.value)}
                  className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                />
                <ResetButton
                  isDefault={local.site.heroTitle === DEFAULT_SETTINGS.site.heroTitle}
                  onReset={() => resetField("site", "heroTitle")}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">副标题列表 · 中文（每行一条）</label>
              <div className="flex items-start gap-2">
                <textarea
                  value={(local.site.heroSubtitles || []).join("\n")}
                  onChange={(e) => {
                    const lines = e.target.value.split("\n").filter((l) => l.trim());
                    updateLocal("site", "heroSubtitles", lines);
                  }}
                  rows={4}
                  className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 resize-y min-h-[80px]"
                  placeholder="每行一条副标题..."
                />
                <ResetButton
                  isDefault={
                    JSON.stringify(local.site.heroSubtitles) ===
                    JSON.stringify(DEFAULT_SETTINGS.site.heroSubtitles)
                  }
                  onReset={() => resetField("site", "heroSubtitles")}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">副标题列表 · English（one per line）</label>
              <div className="flex items-start gap-2">
                <textarea
                  value={(local.site.heroSubtitlesEn || []).join("\n")}
                  onChange={(e) => {
                    const lines = e.target.value.split("\n").filter((l) => l.trim());
                    updateLocal("site", "heroSubtitlesEn", lines);
                  }}
                  rows={4}
                  className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 resize-y min-h-[80px]"
                  placeholder="One subtitle per line..."
                />
                <ResetButton
                  isDefault={
                    JSON.stringify(local.site.heroSubtitlesEn) ===
                    JSON.stringify(DEFAULT_SETTINGS.site.heroSubtitlesEn)
                  }
                  onReset={() => resetField("site", "heroSubtitlesEn")}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">副标题切换模式</label>
              <div className="flex items-center gap-2">
                <div className="flex gap-2 flex-1">
                  {[
                    { value: "sequential", label: "顺序轮播" },
                    { value: "shuffled", label: "随机轮播" },
                    { value: "static", label: "随机显示" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        updateLocal("site", "heroSubtitleMode", opt.value)
                      }
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
                        local.site.heroSubtitleMode === opt.value
                          ? "border-primary bg-primary/15 text-primary shadow-sm"
                          : "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <ResetButton
                  isDefault={
                    local.site.heroSubtitleMode === DEFAULT_SETTINGS.site.heroSubtitleMode
                  }
                  onReset={() => resetField("site", "heroSubtitleMode")}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">
                轮播间隔 ({local.site.heroSubtitleIntervalMs}ms)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1000}
                  max={15000}
                  step={500}
                  value={local.site.heroSubtitleIntervalMs ?? 5000}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    updateLocal("site", "heroSubtitleIntervalMs", v);
                  }}
                  className="flex-1 accent-foreground"
                />
                <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">
                  {(local.site.heroSubtitleIntervalMs ?? 5000) / 1000}s
                </span>
                <ResetButton
                  isDefault={
                    (local.site.heroSubtitleIntervalMs ?? 5000) ===
                    DEFAULT_SETTINGS.site.heroSubtitleIntervalMs
                  }
                  onReset={() => resetField("site", "heroSubtitleIntervalMs")}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>1s</span>
                <span>15s</span>
              </div>
            </div>

            <SectionHeading>分页</SectionHeading>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">每页文章数</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={local.pagination.articlesPerPage}
                    onChange={(e) =>
                      updateLocal("pagination", "articlesPerPage", Number(e.target.value))
                    }
                    className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                  />
                  <ResetButton
                    isDefault={local.pagination.articlesPerPage === DEFAULT_SETTINGS.pagination.articlesPerPage}
                    onReset={() => resetField("pagination", "articlesPerPage")}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">每页词条数</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={local.pagination.wikiPerPage}
                    onChange={(e) =>
                      updateLocal("pagination", "wikiPerPage", Number(e.target.value))
                    }
                    className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                  />
                  <ResetButton
                    isDefault={local.pagination.wikiPerPage === DEFAULT_SETTINGS.pagination.wikiPerPage}
                    onReset={() => resetField("pagination", "wikiPerPage")}
                  />
                </div>
              </div>
            </div>

            <SectionHeading>发布设置</SectionHeading>

            <div>
              <label className="text-sm font-medium block mb-1">默认作者</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={local.publish.defaultAuthor}
                  onChange={(e) => updateLocal("publish", "defaultAuthor", e.target.value)}
                  className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                />
                <ResetButton
                  isDefault={local.publish.defaultAuthor === DEFAULT_SETTINGS.publish.defaultAuthor}
                  onReset={() => resetField("publish", "defaultAuthor")}
                />
              </div>
            </div>
          </div>
        )}

        {/* ===== Appearance ===== */}
        {tab === "appearance" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Settings */}
            <div className="space-y-6">
              <SectionHeading>主题与布局</SectionHeading>

              <div>
                <label className="text-sm font-medium block mb-2">主题模式</label>
                <div className="flex items-center gap-2">
                  <div className="flex gap-2 flex-1">
                    {THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          updateLocal("appearance", "themeMode", opt.value);
                          if (opt.value === "system") {
                            setTheme("system");
                          } else {
                            setTheme(opt.value);
                          }
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
                          a.themeMode === opt.value
                            ? "border-primary bg-primary/15 text-primary shadow-sm"
                            : "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10"
                        }`}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <ResetButton
                    isDefault={a.themeMode === DEFAULT_SETTINGS.appearance.themeMode}
                    onReset={() => {
                      resetField("appearance", "themeMode");
                      setTheme(DEFAULT_SETTINGS.appearance.themeMode);
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">正文宽度 (rem)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={40}
                    max={100}
                    value={a.bodyWidth}
                    onChange={(e) => updateLocal("appearance", "bodyWidth", Number(e.target.value))}
                    className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                  />
                  <ResetButton
                    isDefault={a.bodyWidth === DEFAULT_SETTINGS.appearance.bodyWidth}
                    onReset={() => resetField("appearance", "bodyWidth")}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <SectionHeading>浅色模式 — 主题色</SectionHeading>
                <ResetButton
                  isDefault={
                    a.primary.lightHue === DEFAULT_SETTINGS.appearance.primary.lightHue &&
                    a.primary.lightSaturation === DEFAULT_SETTINGS.appearance.primary.lightSaturation &&
                    a.primary.lightLightness === DEFAULT_SETTINGS.appearance.primary.lightLightness
                  }
                  onReset={() => {
                    updateLocal("appearance", "primary", { ...DEFAULT_SETTINGS.appearance.primary, darkHue: a.primary.darkHue, darkSaturation: a.primary.darkSaturation, darkLightness: a.primary.darkLightness });
                  }}
                />
              </div>

              <HueSlider
                label="色相"
                value={a.primary.lightHue}
                onChange={(v) => updateLocal("appearance", "primary", { ...a.primary, lightHue: v })}
                hue={a.primary.lightHue}
              />
              <SatLightSlider
                label="饱和度"
                value={a.primary.lightSaturation}
                onChange={(v) => updateLocal("appearance", "primary", { ...a.primary, lightSaturation: v })}
                hue={a.primary.lightHue}
                isLightness={false}
              />
              <SatLightSlider
                label="明度"
                value={a.primary.lightLightness}
                onChange={(v) => updateLocal("appearance", "primary", { ...a.primary, lightLightness: v })}
                hue={a.primary.lightHue}
                sat={a.primary.lightSaturation}
                isLightness={true}
              />

              <div className="flex items-center justify-between">
                <SectionHeading>浅色模式 — 强调色</SectionHeading>
                <ResetButton
                  isDefault={
                    a.accent.lightHue === DEFAULT_SETTINGS.appearance.accent.lightHue &&
                    a.accent.lightSaturation === DEFAULT_SETTINGS.appearance.accent.lightSaturation &&
                    a.accent.lightLightness === DEFAULT_SETTINGS.appearance.accent.lightLightness
                  }
                  onReset={() => {
                    updateLocal("appearance", "accent", { ...DEFAULT_SETTINGS.appearance.accent, darkHue: a.accent.darkHue, darkSaturation: a.accent.darkSaturation, darkLightness: a.accent.darkLightness });
                  }}
                />
              </div>

              <HueSlider
                label="色相"
                value={a.accent.lightHue}
                onChange={(v) => updateLocal("appearance", "accent", { ...a.accent, lightHue: v })}
                hue={a.accent.lightHue}
              />
              <SatLightSlider
                label="饱和度"
                value={a.accent.lightSaturation}
                onChange={(v) => updateLocal("appearance", "accent", { ...a.accent, lightSaturation: v })}
                hue={a.accent.lightHue}
                isLightness={false}
              />
              <SatLightSlider
                label="明度"
                value={a.accent.lightLightness}
                onChange={(v) => updateLocal("appearance", "accent", { ...a.accent, lightLightness: v })}
                hue={a.accent.lightHue}
                sat={a.accent.lightSaturation}
                isLightness={true}
              />

              <div className="flex items-center justify-between">
                <SectionHeading>深色模式 — 主题色</SectionHeading>
                <ResetButton
                  isDefault={
                    a.primary.darkHue === DEFAULT_SETTINGS.appearance.primary.darkHue &&
                    a.primary.darkSaturation === DEFAULT_SETTINGS.appearance.primary.darkSaturation &&
                    a.primary.darkLightness === DEFAULT_SETTINGS.appearance.primary.darkLightness
                  }
                  onReset={() => {
                    updateLocal("appearance", "primary", { ...DEFAULT_SETTINGS.appearance.primary, lightHue: a.primary.lightHue, lightSaturation: a.primary.lightSaturation, lightLightness: a.primary.lightLightness });
                  }}
                />
              </div>

              <HueSlider
                label="色相"
                value={a.primary.darkHue}
                onChange={(v) => updateLocal("appearance", "primary", { ...a.primary, darkHue: v })}
                hue={a.primary.darkHue}
              />
              <SatLightSlider
                label="饱和度"
                value={a.primary.darkSaturation}
                onChange={(v) => updateLocal("appearance", "primary", { ...a.primary, darkSaturation: v })}
                hue={a.primary.darkHue}
                isLightness={false}
              />
              <SatLightSlider
                label="明度"
                value={a.primary.darkLightness}
                onChange={(v) => updateLocal("appearance", "primary", { ...a.primary, darkLightness: v })}
                hue={a.primary.darkHue}
                sat={a.primary.darkSaturation}
                isLightness={true}
              />

              <div className="flex items-center justify-between">
                <SectionHeading>深色模式 — 强调色</SectionHeading>
                <ResetButton
                  isDefault={
                    a.accent.darkHue === DEFAULT_SETTINGS.appearance.accent.darkHue &&
                    a.accent.darkSaturation === DEFAULT_SETTINGS.appearance.accent.darkSaturation &&
                    a.accent.darkLightness === DEFAULT_SETTINGS.appearance.accent.darkLightness
                  }
                  onReset={() => {
                    updateLocal("appearance", "accent", { ...DEFAULT_SETTINGS.appearance.accent, lightHue: a.accent.lightHue, lightSaturation: a.accent.lightSaturation, lightLightness: a.accent.lightLightness });
                  }}
                />
              </div>

              <HueSlider
                label="色相"
                value={a.accent.darkHue}
                onChange={(v) => updateLocal("appearance", "accent", { ...a.accent, darkHue: v })}
                hue={a.accent.darkHue}
              />
              <SatLightSlider
                label="饱和度"
                value={a.accent.darkSaturation}
                onChange={(v) => updateLocal("appearance", "accent", { ...a.accent, darkSaturation: v })}
                hue={a.accent.darkHue}
                isLightness={false}
              />
              <SatLightSlider
                label="明度"
                value={a.accent.darkLightness}
                onChange={(v) => updateLocal("appearance", "accent", { ...a.accent, darkLightness: v })}
                hue={a.accent.darkHue}
                sat={a.accent.darkSaturation}
                isLightness={true}
              />

              <SectionHeading>Markdown 样式</SectionHeading>

              <div>
                <label className="text-sm font-medium block mb-1">背景颜色（浅色模式）</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="color"
                      value={a.markdownBgColorLight ?? "#ffffff"}
                      onChange={(e) => updateLocal("appearance", "markdownBgColorLight", e.target.value)}
                      className="size-8 rounded border border-input cursor-pointer"
                    />
                    <input
                      type="text"
                      value={a.markdownBgColorLight ?? "#ffffff"}
                      onChange={(e) => updateLocal("appearance", "markdownBgColorLight", e.target.value)}
                      className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/50"
                    />
                  </div>
                  <ResetButton
                    isDefault={(a.markdownBgColorLight ?? "#ffffff") === DEFAULT_SETTINGS.appearance.markdownBgColorLight}
                    onReset={() => resetField("appearance", "markdownBgColorLight")}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">背景颜色（深色模式）</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="color"
                      value={a.markdownBgColorDark ?? "#0d1117"}
                      onChange={(e) => updateLocal("appearance", "markdownBgColorDark", e.target.value)}
                      className="size-8 rounded border border-input cursor-pointer"
                    />
                    <input
                      type="text"
                      value={a.markdownBgColorDark ?? "#0d1117"}
                      onChange={(e) => updateLocal("appearance", "markdownBgColorDark", e.target.value)}
                      className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/50"
                    />
                  </div>
                  <ResetButton
                    isDefault={(a.markdownBgColorDark ?? "#0d1117") === DEFAULT_SETTINGS.appearance.markdownBgColorDark}
                    onReset={() => resetField("appearance", "markdownBgColorDark")}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">
                  背景不透明度 ({a.markdownBgOpacity}%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={a.markdownBgOpacity}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      updateLocal("appearance", "markdownBgOpacity", v);
                      document.documentElement.style.setProperty("--markdown-bg-opacity", `${v}%`);
                    }}
                    className="flex-1 accent-foreground"
                  />
                  <ResetButton
                    isDefault={a.markdownBgOpacity === DEFAULT_SETTINGS.appearance.markdownBgOpacity}
                    onReset={() => {
                      resetField("appearance", "markdownBgOpacity");
                      document.documentElement.style.setProperty("--markdown-bg-opacity", `${DEFAULT_SETTINGS.appearance.markdownBgOpacity}%`);
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>透明</span>
                  <span>不透明</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">字体颜色（浅色模式）</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="color"
                      value={a.markdownTextColorLight ?? "#1f2328"}
                      onChange={(e) => updateLocal("appearance", "markdownTextColorLight", e.target.value)}
                      className="size-8 rounded border border-input cursor-pointer"
                    />
                    <input
                      type="text"
                      value={a.markdownTextColorLight ?? "#1f2328"}
                      onChange={(e) => updateLocal("appearance", "markdownTextColorLight", e.target.value)}
                      className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/50"
                    />
                  </div>
                  <ResetButton
                    isDefault={(a.markdownTextColorLight ?? "#1f2328") === DEFAULT_SETTINGS.appearance.markdownTextColorLight}
                    onReset={() => resetField("appearance", "markdownTextColorLight")}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">字体颜色（深色模式）</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="color"
                      value={a.markdownTextColorDark ?? "#f0f6fc"}
                      onChange={(e) => updateLocal("appearance", "markdownTextColorDark", e.target.value)}
                      className="size-8 rounded border border-input cursor-pointer"
                    />
                    <input
                      type="text"
                      value={a.markdownTextColorDark ?? "#f0f6fc"}
                      onChange={(e) => updateLocal("appearance", "markdownTextColorDark", e.target.value)}
                      className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/50"
                    />
                  </div>
                  <ResetButton
                    isDefault={(a.markdownTextColorDark ?? "#f0f6fc") === DEFAULT_SETTINGS.appearance.markdownTextColorDark}
                    onReset={() => resetField("appearance", "markdownTextColorDark")}
                  />
                </div>
              </div>

              <SectionHeading>图片设置</SectionHeading>

              <div>
                <label className="text-sm font-medium block mb-1">图片最大宽度 (px)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={200}
                    max={2000}
                    value={a.image?.maxWidth ?? 800}
                    onChange={(e) => updateLocal("appearance", "image", { ...a.image, maxWidth: Number(e.target.value) })}
                    className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                  />
                  <ResetButton
                    isDefault={(a.image?.maxWidth ?? 800) === DEFAULT_SETTINGS.appearance.image.maxWidth}
                    onReset={() => updateLocal("appearance", "image", { ...a.image, maxWidth: DEFAULT_SETTINGS.appearance.image.maxWidth })}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">图片最大高度 (px)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={200}
                    max={2000}
                    value={a.image?.maxHeight ?? 600}
                    onChange={(e) => updateLocal("appearance", "image", { ...a.image, maxHeight: Number(e.target.value) })}
                    className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                  />
                  <ResetButton
                    isDefault={(a.image?.maxHeight ?? 600) === DEFAULT_SETTINGS.appearance.image.maxHeight}
                    onReset={() => updateLocal("appearance", "image", { ...a.image, maxHeight: DEFAULT_SETTINGS.appearance.image.maxHeight })}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">默认宽度比例 ({a.image?.defaultWidthRatio ?? 60}%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={30}
                    max={100}
                    value={a.image?.defaultWidthRatio ?? 60}
                    onChange={(e) => updateLocal("appearance", "image", { ...a.image, defaultWidthRatio: Number(e.target.value) })}
                    className="flex-1 accent-foreground"
                  />
                  <ResetButton
                    isDefault={(a.image?.defaultWidthRatio ?? 60) === DEFAULT_SETTINGS.appearance.image.defaultWidthRatio}
                    onReset={() => updateLocal("appearance", "image", { ...a.image, defaultWidthRatio: DEFAULT_SETTINGS.appearance.image.defaultWidthRatio })}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>30%</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">启用灯箱效果</p>
                  <p className="text-xs text-muted-foreground mt-0.5">点击图片放大查看</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={a.image?.lightboxEnabled ?? true}
                    onClick={() => updateLocal("appearance", "image", { ...a.image, lightboxEnabled: !(a.image?.lightboxEnabled ?? true) })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      (a.image?.lightboxEnabled ?? true) ? "" : "bg-primary/20"
                    }`}
                    style={(a.image?.lightboxEnabled ?? true) ? { backgroundColor: "hsl(var(--primary-hue), var(--primary-sat), var(--primary-light))" } : undefined}
                  >
                    <span
                      className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                        (a.image?.lightboxEnabled ?? true) ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <ResetButton
                    isDefault={(a.image?.lightboxEnabled ?? true) === DEFAULT_SETTINGS.appearance.image.lightboxEnabled}
                    onReset={() => updateLocal("appearance", "image", { ...a.image, lightboxEnabled: DEFAULT_SETTINGS.appearance.image.lightboxEnabled })}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Caption 忽略列表</label>
                <p className="text-xs text-muted-foreground mb-2">当图片的 alt 文本匹配列表中的内容时，灯箱中不显示 caption。每行一个，精确匹配。</p>
                <div className="flex items-start gap-2">
                  <CaptionIgnoreTextarea
                    initial={(a.image?.captionIgnoreList ?? []).join("\n")}
                    onChange={(text) => {
                      const list = text.split("\n").map((s) => s.trimEnd());
                      updateLocal("appearance", "image", { ...a.image, captionIgnoreList: list });
                    }}
                  />
                  <ResetButton
                    isDefault={JSON.stringify(a.image?.captionIgnoreList ?? []) === JSON.stringify(DEFAULT_SETTINGS.appearance.image.captionIgnoreList)}
                    onReset={() => updateLocal("appearance", "image", { ...a.image, captionIgnoreList: DEFAULT_SETTINGS.appearance.image.captionIgnoreList })}
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              <h3 className="text-lg font-semibold mb-4 pb-2 border-b border-border">实时预览</h3>
              {(() => {
                const isDark =
                  a.themeMode === "dark" ||
                  (a.themeMode === "system" &&
                    typeof window !== "undefined" &&
                    window.matchMedia("(prefers-color-scheme: dark)").matches);

                const previewBg = "var(--background)";
                const previewBorder = isDark
                  ? `hsl(var(--primary-hue), var(--primary-sat), 20%)`
                  : `hsl(var(--primary-hue), var(--primary-sat), 70%)`;
                const previewHeading = isDark
                  ? `hsl(var(--primary-hue), var(--primary-sat), var(--primary-light))`
                  : `hsl(var(--primary-hue), var(--primary-sat), var(--primary-light))`;

                const mdBgColor = isDark ? (a.markdownBgColorDark ?? "#0d1117") : (a.markdownBgColorLight ?? "#ffffff");
                const mdTextColor = isDark ? (a.markdownTextColorDark ?? "#f0f6fc") : (a.markdownTextColorLight ?? "#1f2328");

                return (
              <div
                className="rounded-xl border p-5 space-y-4"
                style={{
                  backgroundColor: previewBg,
                  borderColor: previewBorder,
                }}
              >
                <h3
                  className="text-lg font-semibold"
                  style={{ color: previewHeading }}
                >
                  预览标题
                </h3>
                <p className="text-sm text-muted-foreground">
                  这是一段示例正文内容，用于展示当前配色方案的效果。
                </p>
                <div className="flex gap-2">
                  <a
                    href="#"
                    className="text-sm underline"
                    style={{ color: previewHeading }}
                  >
                    链接示例
                  </a>
                  <a
                    href="#"
                    className="text-sm underline"
                    style={{ color: `hsl(var(--accent-hue), var(--accent-sat), var(--accent-light))` }}
                  >
                    强调链接
                  </a>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-4 py-1.5 text-sm font-medium text-white"
                    style={{
                      backgroundColor: previewHeading,
                    }}
                  >
                    主要按钮
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-4 py-1.5 text-sm font-medium text-white"
                    style={{
                      backgroundColor: `hsl(var(--accent-hue), var(--accent-sat), var(--accent-light))`,
                    }}
                  >
                    强调按钮
                  </button>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  style={{
                    backgroundColor: `${previewHeading}1A`,
                    color: previewHeading,
                    borderColor: `${previewHeading}33`,
                  }}
                >
                  标签示例
                </Badge>

                {/* Markdown preview */}
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Markdown 渲染效果预览：</p>
                  <div
                    className="rounded-lg p-4 text-sm leading-relaxed"
                    style={{
                      backgroundColor: a.markdownBgOpacity === 0
                        ? "transparent"
                        : `color-mix(in srgb, ${mdBgColor} ${a.markdownBgOpacity}%, transparent)`,
                      color: mdTextColor,
                    }}
                  >
                    <p style={{ fontWeight: 600, fontSize: "1.125em", marginBottom: "0.5em" }}>
                      标题
                    </p>
                    <p style={{ marginBottom: "0.5em" }}>
                      这是一段 Markdown 正文内容，展示了当前背景色、不透明度和字体颜色的效果。
                    </p>
                    <p style={{ marginBottom: "0.5em" }}>
                      你可以调整左侧的颜色选择器和滑块来改变样式。
                    </p>
                  </div>
                </div>
              </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ===== Features ===== */}
        {tab === "features" && (
          <div className="space-y-6 max-w-lg">
            <SectionHeading>功能开关</SectionHeading>

            {[
              { key: "aiReview", label: "AI 审查", desc: "发布文章时自动进行 AI 内容审查" },
              { key: "autoTranslate", label: "自动翻译", desc: "发布文章时自动创建翻译任务" },
              { key: "wikiDiscovery", label: "词条发现", desc: "从文章中自动发现候选词条" },
              { key: "wikiGenerate", label: "词条生成", desc: "审批后自动生成词条内容" },
              { key: "comments", label: "评论", desc: "允许读者发表评论" },
              { key: "rss", label: "RSS", desc: "生成 RSS 订阅源" },
            ].map((feat) => (
              <div
                key={feat.key}
                className="flex items-center justify-between rounded-lg border border-border p-4"
              >
                <div>
                  <p className="text-sm font-medium">{feat.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{feat.desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!local.features[feat.key]}
                    onClick={() =>
                      updateLocal("features", feat.key, !local.features[feat.key])
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      local.features[feat.key]
                        ? ""
                        : "bg-primary/20"
                    }`}
                    style={local.features[feat.key] ? { backgroundColor: "hsl(var(--primary-hue), var(--primary-sat), var(--primary-light))" } : undefined}
                  >
                    <span
                      className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                        local.features[feat.key] ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ===== Notifications ===== */}
        {tab === "notifications" && (
          <div className="space-y-6 max-w-lg">
            <SectionHeading>通知设置</SectionHeading>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium">邮件通知</p>
                <p className="text-xs text-muted-foreground mt-0.5">启用邮件通知功能</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!local.notifications.email}
                  onClick={() =>
                    updateLocal("notifications", "email", !local.notifications.email)
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    local.notifications.email ? "" : "bg-primary/20"
                  }`}
                  style={local.notifications.email ? { backgroundColor: "hsl(var(--primary-hue), var(--primary-sat), var(--primary-light))" } : undefined}
                >
                  <span
                    className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                      local.notifications.email ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">管理员邮箱</label>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={local.notifications.adminEmail as string}
                  onChange={(e) => updateLocal("notifications", "adminEmail", e.target.value)}
                  placeholder="admin@example.com"
                  className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                />
                <ResetButton
                  isDefault={local.notifications.adminEmail === DEFAULT_SETTINGS.notifications.adminEmail}
                  onReset={() => resetField("notifications", "adminEmail")}
                />
              </div>
            </div>

            {[
              { key: "onComment", label: "新评论通知" },
              { key: "onDiscovery", label: "新词条发现通知" },
              { key: "onTranslate", label: "翻译完成通知" },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-lg border border-border p-4"
              >
                <p className="text-sm font-medium">{item.label}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!(local.notifications as Record<string, unknown>)[item.key]}
                    onClick={() =>
                      updateLocal("notifications", item.key, !(local.notifications as Record<string, unknown>)[item.key])
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      (local.notifications as Record<string, unknown>)[item.key]
                        ? ""
                        : "bg-primary/20"
                    }`}
                    style={(local.notifications as Record<string, unknown>)[item.key] ? { backgroundColor: "hsl(var(--primary-hue), var(--primary-sat), var(--primary-light))" } : undefined}
                  >
                    <span
                      className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                        (local.notifications as Record<string, unknown>)[item.key]
                          ? "translate-x-4"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ===== Dev ===== */}
        {tab === "dev" && (
          <div className="space-y-6 max-w-lg">
            <SectionHeading>开发模式</SectionHeading>
            <p className="text-xs text-muted-foreground">
              开发模式开关控制测试辅助功能。启用后可用于本地开发和调试。
            </p>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium">开发模式</p>
                <p className="text-xs text-muted-foreground mt-0.5">启用开发模式开关</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!local.features.devMode}
                  onClick={() =>
                    updateLocal("features", "devMode", !local.features.devMode)
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    local.features.devMode ? "" : "bg-primary/20"
                  }`}
                  style={local.features.devMode ? { backgroundColor: "hsl(var(--primary-hue), var(--primary-sat), var(--primary-light))" } : undefined}
                >
                  <span
                    className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                      local.features.devMode ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            {local.features.devMode && (
              <div className="space-y-4 pl-4 border-l-2 border-muted">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium">真实邮件发送</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      关闭时邮件将打印到控制台而非实际发送
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!local.features.realEmail}
                      onClick={() =>
                        updateLocal("features", "realEmail", !local.features.realEmail)
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        local.features.realEmail ? "" : "bg-primary/20"
                      }`}
                      style={local.features.realEmail ? { backgroundColor: "hsl(var(--primary-hue), var(--primary-sat), var(--primary-light))" } : undefined}
                    >
                      <span
                        className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                          local.features.realEmail ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium">跳过邮箱验证</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      注册时自动标记邮箱已验证，无需验证邮件
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!local.features.skipEmailVerification}
                      onClick={() =>
                        updateLocal("features", "skipEmailVerification", !local.features.skipEmailVerification)
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        local.features.skipEmailVerification ? "" : "bg-primary/20"
                      }`}
                      style={local.features.skipEmailVerification ? { backgroundColor: "hsl(var(--primary-hue), var(--primary-sat), var(--primary-light))" } : undefined}
                    >
                      <span
                        className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                          local.features.skipEmailVerification ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 p-3">
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                <strong>注意：</strong>开发模式开关仅在本地开发环境中使用。在生产环境中启用开发模式可能带来安全风险。
              </p>
            </div>
          </div>
        )}

        {/* ===== Advanced ===== */}
        {tab === "advanced" && (
          <div className="space-y-6 max-w-lg">
            <SectionHeading>编译器</SectionHeading>

            {Object.entries(local.compilers).map(([key, val]) => {
              const compiler = val as { name: string; extensions: string[]; enabled: boolean };
              return (
                <div
                  key={key}
                  className="rounded-lg border border-border p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{compiler.name}</p>
                    <Badge variant={compiler.enabled ? "default" : "secondary"}>
                      {compiler.enabled ? "已启用" : "已禁用"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    扩展名: {compiler.extensions.join(", ")}
                  </p>
                </div>
              );
            })}

            <SectionHeading>助手任务 Prompt</SectionHeading>
            <p className="text-xs text-muted-foreground">
              设置各助手任务的提示词，用于生成助手任务的描述。
            </p>

            {Object.keys(local.prompts).map((key) => {
              const val = local.prompts[key];
              const defaultVal = defaultPrompts?.[key] ?? "";
              // Show the effective content: custom value if set, otherwise the default template
              const displayValue = val || defaultVal;
              // "恢复默认" is hidden when the current value matches the default template
              const matchesDefault = displayValue === defaultVal;
              return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium capitalize">{key}</label>
                  <div className="flex items-center gap-2">
                    {!matchesDefault && (
                      <button
                        type="button"
                        onClick={() => {
                          // Reset: put the default template from default-settings.json into the textarea
                          updateLocal("prompts", key, defaultVal);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        title="恢复默认模板"
                      >
                        <Undo2 className="size-3" />
                        恢复默认
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  value={displayValue}
                  onChange={(e) => updateLocal("prompts", key, e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/50 resize-y"
                />
              </div>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A textarea for caption ignore list that uses its own state instead of being
 * a fully controlled component, so newlines and spaces work naturally.
 */
function CaptionIgnoreTextarea({
  initial,
  onChange,
}: {
  initial: string;
  onChange: (text: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef(initial);
  // Sync when initial changes from outside (e.g. reset)
  if (initial !== ref.current) {
    ref.current = initial;
    // Only update if user hasn't edited
    if (value === ref.current) {
      setValue(initial);
    }
  }
  return (
    <textarea
      value={value}
      onChange={(e) => {
        const text = e.target.value;
        setValue(text);
        onChange(text);
      }}
      rows={3}
      placeholder={"alt text"}
      className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/50 resize-y"
    />
  );
}
