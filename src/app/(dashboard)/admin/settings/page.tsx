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

import { useEffect, useState, useCallback } from "react";
import {
  Save,
  Settings2,
  Palette,
  ToggleLeft,
  Bell,
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
import { REVIEW_PROMPT } from "@/lib/ai/prompts/review";

// Default hardcoded prompts shown when no custom override is set
const DEFAULT_SETTINGS: AppSettings = {
  site: { title: "Miniese's Blog", description: "个人技术博客与知识库", headerTitle: "Miniese's Blog" },
  pagination: { articlesPerPage: 10, wikiPerPage: 20 },
  appearance: {
    themeMode: "system", bodyWidth: 66,
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
  prompts: { review: "", translate: "", discovery: "", generate: "" },
};

const DEFAULT_PROMPTS: Record<string, string> = {
  review: REVIEW_PROMPT,
  translate: `将以下内容从源语言翻译为目标语言。

要求：
1. [TRANSLATE_START]...[TRANSLATE_END] 之间的内容是需要翻译的目标内容。
2. [TRANSLATE_START]...[TRANSLATE_END] 之外的文本是上下文，仅作参考，不要修改它们。
3. 保持所有格式、语法标记和代码块不变。
4. 保持所有技术术语和专有名词的原始形式。
5. 保持代码块内的代码不变。
6. 保持内联链接、图片和其他语法不变。
7. 不要添加任何解释或备注。
8. 只返回翻译后的内容，并包裹在相同的 [TRANSLATE_START]/[TRANSLATE_END] 标记中。`,
  discovery: `你是一位技术文档分析专家。请扫描以下文章内容，提取值得添加为知识库词条的术语。

## 值得添加的术语类型
- 缩写（中英文皆可）：API、中科院、PPO
- 技术术语/概念：闭包、依赖注入、函数式编程
- 定理/公式：勾股定理、贝叶斯定理、NP完全
- 技术栈/工具：TypeScript、Docker、PostgreSQL
- 其他需要解释的名词：RFC 2616、OAuth 2.0

## 不值得添加的类型
- 常见名词：汽车、红色、桌子
- 常见动词：运行、调用、返回
- 代词/连词：这个、那个、以及
- 人名（非知名人物）：小明、李老师

## 输出格式
返回严格的 JSON 对象：

{
  "candidates": [
    {
      "term": "术语名称",
      "type": "acronym | concept | theorem | tech | other",
      "definition": "一句话简要解释（10-30字）",
      "importance": 0.95
    }
  ]
}`,
  generate: `你是一位技术百科编辑。请为给定的术语生成完整的词条内容。

## 输出格式
返回严格的 JSON 对象：

{
  "aliases": ["别名1", "别名2"],
  "definition": "简短定义（30-80字，用于悬停预览）",
  "content": "详细介绍...\\n\\n#### 示例\\n...",
  "tags": ["标签1", "标签2"],
  "type": "acronym | concept | theorem | tech | other"
}

## 写作要求
1. **definition**：一句简洁的定义，适合悬停预览。使用与术语上下文相同的语言。
2. **content**：完整教程风格的词条内容（Markdown格式），包括：
   - 详细介绍（2-3段）
   - 使用示例（如有）
   - 相关概念（如有）
   - 公式使用 KaTeX 格式，行内公式用 $公式$，展示公式用 $$公式$$
   - 不要包含顶级标题（名称已显示在页面上）
   - 使用 ####（四级标题）作为小节标题，避免嵌套标题
3. **aliases**：常见的别名或缩写
4. **tags**：分类标签
5. **type**：可选值：acronym、concept、theorem、tech、other

## 基于训练知识
- 使用你的现有知识生成内容
- 不要编造不存在的信息
- 如果确实无法生成有意义的内容，返回 { "unable": true }`,
};

type TabId = "general" | "appearance" | "features" | "notifications" | "advanced";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "常规", icon: <Settings2 className="size-4" /> },
  { id: "appearance", label: "外观", icon: <Palette className="size-4" /> },
  { id: "features", label: "功能开关", icon: <ToggleLeft className="size-4" /> },
  { id: "notifications", label: "通知", icon: <Bell className="size-4" /> },
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
  const { setTheme } = useTheme();

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data: AppSettings) => {
        setSettings(data);
        setLocal(JSON.parse(JSON.stringify(data))); // deep clone
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
        <h1 className="text-3xl font-bold tracking-tight">站点设置</h1>
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
                  <ResetButton
                    isDefault={local.features[feat.key] === DEFAULT_SETTINGS.features[feat.key]}
                    onReset={() => resetField("features", feat.key)}
                  />
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
                <ResetButton
                  isDefault={local.notifications.email === DEFAULT_SETTINGS.notifications.email}
                  onReset={() => resetField("notifications", "email")}
                />
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
                  <ResetButton
                    isDefault={(local.notifications as Record<string, unknown>)[item.key] === (DEFAULT_SETTINGS.notifications as Record<string, unknown>)[item.key]}
                    onReset={() => resetField("notifications", item.key)}
                  />
                </div>
              </div>
            ))}
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

            <SectionHeading>Prompt 模板</SectionHeading>
            <p className="text-xs text-muted-foreground">
              以下为 AI 任务的默认 Prompt 模板。留空使用内置默认模板，填写自定义内容将覆寫默认。
            </p>

            {Object.keys(local.prompts).map((key) => {
              const val = local.prompts[key];
              // Show the effective prompt: custom override if set, otherwise the built-in default
              const effectiveVal = val || DEFAULT_PROMPTS[key] || "";
              const isCustom = !!val;
              return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium capitalize">{key}</label>
                  <div className="flex items-center gap-2">
                    {isCustom && (
                      <>
                        <span className="text-[10px] text-primary">自定义</span>
                        <button
                          type="button"
                          onClick={() => updateLocal("prompts", key, "")}
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          title="恢复默认模板"
                        >
                          <Undo2 className="size-3" />
                          恢复默认
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <textarea
                  value={effectiveVal}
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
