"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  getAdultGenre,
  getDailySnapshots,
  getDailyAggregate,
  triggerSnapshot,
  triggerMonitor,
  getAccountsWithProfile,
  type ApiReferenceAccount,
  type ApiDailySnapshot,
  type ApiDailyAggregate,
} from "@/lib/api";
import {
  ArrowLeft, TrendingUp, Users, Eye, Heart, BarChart2,
  RefreshCw, Camera, Loader2, Activity, Zap,
} from "lucide-react";

// ---- Colors ----
const CHART_COLORS = [
  "#a78bfa", "#f472b6", "#60a5fa", "#4ade80", "#fbbf24",
  "#f87171", "#38bdf8", "#c084fc", "#fb923c", "#34d399",
];

const GLASS = {
  bg: "rgba(15,12,30,0.6)",
  border: "1px solid rgba(139,92,246,0.15)",
  borderHover: "1px solid rgba(139,92,246,0.3)",
};

// ---- Metric Card ----
function MetricCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: GLASS.bg, border: GLASS.border }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4" style={{ color }} />
        <span className="text-xs" style={{ color: "rgba(240,238,255,0.5)" }}>{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "rgba(240,238,255,0.35)" }}>{sub}</p>}
    </div>
  );
}

// ---- Chart Wrapper ----
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: GLASS.bg, border: GLASS.border }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: "#c4b5fd" }}>{title}</h3>
      {children}
    </div>
  );
}

// ---- Custom Tooltip ----
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg p-3 text-xs" style={{ background: "rgba(15,12,30,0.95)", border: GLASS.border }}>
      <p className="mb-1.5 font-medium" style={{ color: "rgba(240,238,255,0.7)" }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex justify-between gap-4" style={{ color: entry.color }}>
          <span>{entry.name}</span>
          <span className="font-mono">{typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}</span>
        </p>
      ))}
    </div>
  );
}

type Tab = "aggregate" | "individual";
type Period = 7 | 14 | 30 | 90;

export default function MonitorPage() {
  const params = useParams();
  const router = useRouter();
  const genreId = params.id as string;

  const [genre, setGenre] = useState<{ id: string; name: string } | null>(null);
  const [accounts, setAccounts] = useState<ApiReferenceAccount[]>([]);
  const [snapshots, setSnapshots] = useState<ApiDailySnapshot[]>([]);
  const [aggregate, setAggregate] = useState<ApiDailyAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapping, setSnapping] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [tab, setTab] = useState<Tab>("aggregate");
  const [period, setPeriod] = useState<Period>(30);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, accs, snaps, agg] = await Promise.all([
        getAdultGenre(genreId),
        getAccountsWithProfile(genreId),
        getDailySnapshots(genreId, period),
        getDailyAggregate(genreId, period),
      ]);
      setGenre(g);
      setAccounts(accs);
      setSnapshots(snaps);
      setAggregate(agg);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [genreId, period]);

  useEffect(() => { load(); }, [load]);

  const handleSnapshot = async () => {
    setSnapping(true);
    try {
      await triggerSnapshot(genreId);
      await load();
    } finally {
      setSnapping(false);
    }
  };

  const handleMonitor = async () => {
    setMonitoring(true);
    try {
      await triggerMonitor(genreId);
    } finally {
      setMonitoring(false);
    }
  };

  // ---- Build chart data for individual accounts ----
  const individualChartData = useMemo(() => {
    const filtered = selectedAccount
      ? snapshots.filter((s) => s.referenceAccountId === selectedAccount)
      : snapshots;

    const byDate = new Map<string, Record<string, number>>();

    for (const s of filtered) {
      const acc = accounts.find((a) => a.id === s.referenceAccountId);
      const key = acc?.username ?? s.referenceAccountId.slice(0, 8);
      if (!byDate.has(s.snapshotDate)) byDate.set(s.snapshotDate, { date: 0 } as unknown as Record<string, number>);
      const row = byDate.get(s.snapshotDate)!;
      row[`${key}_followers`] = s.followersCount ?? 0;
      row[`${key}_likes`] = s.totalLikes;
      row[`${key}_impressions`] = s.totalImpressions;
      row[`${key}_posts`] = s.dailyPostsCount;
    }

    return Array.from(byDate.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [snapshots, accounts, selectedAccount]);

  const accountKeys = useMemo(() => {
    if (selectedAccount) {
      const acc = accounts.find((a) => a.id === selectedAccount);
      return acc ? [acc.username] : [];
    }
    return accounts.map((a) => a.username);
  }, [accounts, selectedAccount]);

  // ---- Latest aggregate totals ----
  const latestAgg = aggregate[aggregate.length - 1];

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#a78bfa" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/threads-analysis")}
            className="rounded-lg p-2 transition-colors" style={{ color: "rgba(240,238,255,0.5)" }}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#e2dff6" }}>
              {genre?.name ?? "..."} - スコア監視
            </h1>
            <p className="text-xs" style={{ color: "rgba(240,238,255,0.4)" }}>
              {accounts.length}アカウント監視中
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          {([7, 14, 30, 90] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={period === p
                ? { background: "rgba(139,92,246,0.25)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.3)" }
                : { color: "rgba(240,238,255,0.4)", border: "1px solid rgba(139,92,246,0.1)" }
              }
            >
              {p}日
            </button>
          ))}

          <button onClick={handleMonitor} disabled={monitoring}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}>
            {monitoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            監視実行
          </button>

          <button onClick={handleSnapshot} disabled={snapping}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.2)" }}>
            {snapping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
            スナップショット
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {latestAgg && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <MetricCard label="合計フォロワー" value={latestAgg.totalFollowers} icon={Users} color="#a78bfa" />
          <MetricCard label="合計いいね" value={latestAgg.totalLikes} icon={Heart} color="#f472b6" />
          <MetricCard label="合計インプレッション" value={latestAgg.totalImpressions} icon={Eye} color="#60a5fa" />
          <MetricCard label="本日の投稿数" value={latestAgg.totalDailyPosts} icon={BarChart2} color="#4ade80" />
          <MetricCard label="平均エンゲージメント率" value={`${(latestAgg.avgEngagementRate * 100).toFixed(2)}%`} icon={Activity} color="#fbbf24" />
          <MetricCard label="監視アカウント数" value={latestAgg.accountCount} icon={Zap} color="#f87171" />
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex items-center gap-2">
        <button onClick={() => setTab("aggregate")}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={tab === "aggregate"
            ? { background: "rgba(139,92,246,0.2)", color: "#c4b5fd" }
            : { color: "rgba(240,238,255,0.4)" }
          }>
          全体合計
        </button>
        <button onClick={() => setTab("individual")}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={tab === "individual"
            ? { background: "rgba(139,92,246,0.2)", color: "#c4b5fd" }
            : { color: "rgba(240,238,255,0.4)" }
          }>
          アカウント別
        </button>

        {tab === "individual" && (
          <select
            value={selectedAccount ?? ""}
            onChange={(e) => setSelectedAccount(e.target.value || null)}
            className="rounded-lg px-3 py-1.5 text-xs ml-2"
            style={{ background: "rgba(15,12,30,0.8)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.2)" }}
          >
            <option value="">全アカウント</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>@{a.username}</option>
            ))}
          </select>
        )}
      </div>

      {/* Charts */}
      {tab === "aggregate" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Follower Trend */}
          <ChartCard title="フォロワー数推移（合計）">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={aggregate}>
                <defs>
                  <linearGradient id="gradFollowers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                <XAxis dataKey="snapshotDate" tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="totalFollowers" name="フォロワー" stroke="#a78bfa" fill="url(#gradFollowers)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Likes Trend */}
          <ChartCard title="いいね数推移（合計）">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={aggregate}>
                <defs>
                  <linearGradient id="gradLikes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f472b6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f472b6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                <XAxis dataKey="snapshotDate" tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="totalLikes" name="いいね" stroke="#f472b6" fill="url(#gradLikes)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Impressions Trend */}
          <ChartCard title="インプレッション推移（合計）">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={aggregate}>
                <defs>
                  <linearGradient id="gradImps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                <XAxis dataKey="snapshotDate" tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="totalImpressions" name="インプレッション" stroke="#60a5fa" fill="url(#gradImps)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Engagement Rate */}
          <ChartCard title="エンゲージメント率推移（平均）">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={aggregate}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                <XAxis dataKey="snapshotDate" tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="avgEngagementRate" name="エンゲージメント率"
                  stroke="#fbbf24" strokeWidth={2} dot={{ r: 3, fill: "#fbbf24" }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Daily Posts */}
          <ChartCard title="1日の投稿数推移（合計）">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={aggregate}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                <XAxis dataKey="snapshotDate" tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="totalDailyPosts" name="投稿数" fill="#4ade80" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Reposts */}
          <ChartCard title="リポスト数推移（合計）">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={aggregate}>
                <defs>
                  <linearGradient id="gradReposts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                <XAxis dataKey="snapshotDate" tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="totalReposts" name="リポスト" stroke="#f87171" fill="url(#gradReposts)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      ) : (
        /* Individual Account Charts */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="フォロワー数推移（アカウント別）">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={individualChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(240,238,255,0.6)" }} />
                {accountKeys.map((key, i) => (
                  <Line key={key} type="monotone" dataKey={`${key}_followers`} name={`@${key}`}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="いいね数推移（アカウント別）">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={individualChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(240,238,255,0.6)" }} />
                {accountKeys.map((key, i) => (
                  <Line key={key} type="monotone" dataKey={`${key}_likes`} name={`@${key}`}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="インプレッション推移（アカウント別）">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={individualChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(240,238,255,0.6)" }} />
                {accountKeys.map((key, i) => (
                  <Line key={key} type="monotone" dataKey={`${key}_impressions`} name={`@${key}`}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="1日の投稿数（アカウント別）">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={individualChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(240,238,255,0.6)" }} />
                {accountKeys.map((key, i) => (
                  <Bar key={key} dataKey={`${key}_posts`} name={`@${key}`}
                    fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[2, 2, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* Account List */}
      <div className="rounded-xl p-5" style={{ background: GLASS.bg, border: GLASS.border }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: "#c4b5fd" }}>監視中のアカウント</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((acc) => (
            <div key={acc.id} className="rounded-lg p-3 space-y-2 cursor-pointer transition-all"
              style={{ background: "rgba(139,92,246,0.06)", border: selectedAccount === acc.id ? "1px solid rgba(139,92,246,0.4)" : "1px solid rgba(139,92,246,0.1)" }}
              onClick={() => { setTab("individual"); setSelectedAccount(selectedAccount === acc.id ? null : acc.id); }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "#c4b5fd" }}>@{acc.username}</span>
                {acc.accountCreatedAt && (
                  <span className="text-[10px]" style={{ color: "rgba(240,238,255,0.3)" }}>{acc.accountCreatedAt}</span>
                )}
              </div>
              <div className="flex gap-4 text-xs" style={{ color: "rgba(240,238,255,0.5)" }}>
                {acc.followersCount !== null && (
                  <span><Users className="inline h-3 w-3 mr-0.5" />{acc.followersCount.toLocaleString()}</span>
                )}
                {acc.postsCount !== null && (
                  <span>{acc.postsCount.toLocaleString()}投稿</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
