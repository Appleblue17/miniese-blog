/**
 * @file /admin/ai/tokens — Token Usage Dashboard
 *
 * Displays AI token usage statistics:
 * - Summary cards (current month total, per-type breakdown)
 * - Daily usage chart (line chart using Recharts)
 * - Recent usage logs table
 */

"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Loader2, AlertCircle, PieChart, BarChart3, History } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenSummary {
  currentMonth: {
    total: number;
    promptTokens: number;
    completionTokens: number;
  };
  previousMonth: { total: number } | null;
  perType: Array<{ type: string; total: number; percentage: number }>;
  dailyUsage: Array<{ date: string; total: number }>;
  thisMonthTotal: number;
}

interface RecentRecord {
  id: string;
  type: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

const TYPE_LABELS: Record<string, string> = {
  review: "审查",
  translate: "翻译",
  generate: "词条生成",
  discover: "词条发现",
  chat: "AI 聊天",
};

const TYPE_COLORS: Record<string, string> = {
  review: "#3b82f6",
  translate: "#10b981",
  generate: "#f59e0b",
  discover: "#8b5cf6",
  chat: "#ec4899",
};

// ---------------------------------------------------------------------------
// TokenUsageCard
// ---------------------------------------------------------------------------

function TokenUsageCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4 flex items-start gap-3"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="p-2 rounded-md" style={{ backgroundColor: `${color}15` }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-xl font-semibold mt-0.5">{value}</p>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TokenDashboardPage() {
  const [summary, setSummary] = useState<TokenSummary | null>(null);
  const [recent, setRecent] = useState<RecentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/ai/tokens/summary?days=30"),
      fetch("/api/admin/ai/tokens/recent?limit=30"),
    ])
      .then(async ([summaryRes, recentRes]) => {
        if (!summaryRes.ok) {
          throw new Error(`Summary API error: ${summaryRes.status}`);
        }
        if (!recentRes.ok) {
          throw new Error(`Recent API error: ${recentRes.status}`);
        }
        const [summaryData, recentData] = await Promise.all([
          summaryRes.json(),
          recentRes.json(),
        ]);
        setSummary(summaryData);
        setRecent(recentData.records || []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-16 text-destructive justify-center">
        <AlertCircle className="size-5" />
        <span>加载失败：{error}</span>
      </div>
    );
  }

  if (!summary) return null;

  const { currentMonth, previousMonth, perType, dailyUsage } = summary;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Token 用量</h1>
        <p className="text-sm text-muted-foreground mt-1">
          监控 AI 服务的 Token 使用情况
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <TokenUsageCard
          title="本月总计"
          value={formatNumber(currentMonth.total)}
          subtitle={
            previousMonth
              ? `上月 ${formatNumber(previousMonth.total)}`
              : "无上月数据"
          }
          icon={<PieChart className="size-4 text-blue-500" />}
          color="#3b82f6"
        />
        <TokenUsageCard
          title="输入 (Prompt)"
          value={formatNumber(currentMonth.promptTokens)}
          subtitle={`占 ${currentMonth.total > 0 ? ((currentMonth.promptTokens / currentMonth.total) * 100).toFixed(1) : 0}%`}
          icon={<BarChart3 className="size-4 text-emerald-500" />}
          color="#10b981"
        />
        <TokenUsageCard
          title="输出 (Completion)"
          value={formatNumber(currentMonth.completionTokens)}
          subtitle={`占 ${currentMonth.total > 0 ? ((currentMonth.completionTokens / currentMonth.total) * 100).toFixed(1) : 0}%`}
          icon={<BarChart3 className="size-4 text-amber-500" />}
          color="#f59e0b"
        />
        <TokenUsageCard
          title="调用次数"
          value={String(recent.length + (recent.length > 0 ? "+" : ""))}
          subtitle="最近 30 条记录"
          icon={<History className="size-4 text-purple-500" />}
          color="#8b5cf6"
        />
      </div>

      {/* Per-Type Breakdown + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Type Breakdown Table */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">按类型统计</h2>
          <div className="space-y-2">
            {perType.map((t) => (
              <div key={t.type} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: TYPE_COLORS[t.type] || "#6b7280" }}
                  />
                  <span>{TYPE_LABELS[t.type] || t.type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{formatNumber(t.total)}</span>
                  <span className="text-[11px] text-muted-foreground w-10 text-right">
                    {t.percentage}%
                  </span>
                </div>
              </div>
            ))}
            {perType.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                暂无数据
              </p>
            )}
          </div>
        </div>

        {/* Daily Usage Chart */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">每日趋势（近 30 天）</h2>
          {dailyUsage.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyUsage}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => formatDate(v)}
                  tick={{ fontSize: 11 }}
                  stroke="var(--border)"
                />
                <YAxis
                  tickFormatter={(v: number) => formatNumber(v)}
                  tick={{ fontSize: 11 }}
                  stroke="var(--border)"
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  labelFormatter={(_label: any, payload: any) => formatDate(payload?.[0]?.payload?.date ?? "")}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [formatNumber(Number(value) || 0), "Tokens"]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground py-8 text-center">
              暂无每日数据
            </p>
          )}
        </div>
      </div>

      {/* Recent Records Table */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">最近调用记录</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">
                  类型
                </th>
                <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">
                  Prompt
                </th>
                <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">
                  Completion
                </th>
                <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">
                  总计
                </th>
                <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">
                  时间
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-muted/50">
                  <td className="px-4 py-2">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs"
                    >
                      <span
                        className="size-2 rounded-full inline-block"
                        style={{ backgroundColor: TYPE_COLORS[r.type] || "#6b7280" }}
                      />
                      {TYPE_LABELS[r.type] || r.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {r.promptTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {r.completionTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {r.totalTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground text-[11px]">
                    {formatDateTime(r.createdAt)}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">
                    暂无记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
