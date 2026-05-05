"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import {
  getPerformanceRanking,
  getPerformanceSummary,
  getAccounts,
  getPostMetricsHistory,
  type ApiPerformancePost,
  type ApiPerformanceSummary,
  type ApiAccount,
  type ApiPostMetricsHistoryPoint,
} from "@/lib/api";
import {
  Trophy, Heart, Eye, TrendingUp, Zap, Loader2, BarChart2,
  Crown, Medal, Award, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";

const GLASS = {
  bg: "rgba(15,12,30,0.6)",
  border: "1px solid rgba(139,92,246,0.15)",
};

type Metric = "likes" | "impressions" | "engagement" | "initial";

const METRIC_CONFIG: Record<Metric, { label: string; icon: React.ElementType; color: string }> = {
  likes: { label: "いいね数", icon: Heart, color: "#f472b6" },
  impressions: { label: "インプ数", icon: Eye, color: "#60a5fa" },
  engagement: { label: "エンゲージメント率", icon: TrendingUp, color: "#fbbf24" },
  initial: { label: "初動（初回いいね）", icon: Zap, color: "#4ade80" },
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-5 w-5" style={{ color: "#fbbf24" }} />;
  if (rank === 2) return <Medal className="h-5 w-5" style={{ color: "#94a3b8" }} />;
  if (rank === 3) return <Award className="h-5 w-5" style={{ color: "#cd7f32" }} />;
  return <span className="text-sm font-bold w-5 text-center" style={{ color: "rgba(240,238,255,0.35)" }}>#{rank}</span>;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg p-3 text-xs" style={{ background: "rgba(15,12,30,0.95)", border: GLASS.border }}>
      <p className="mb-1.5" style={{ color: "rgba(240,238,255,0.7)" }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>{entry.name}: {entry.value.toLocaleString()}</p>
      ))}
    </div>
  );
}

// ─── 自動更新間隔の選択肢 ────────────────────────────────────
const REFRESH_INTERVALS = [
  { value: 0, label: "オフ" },
  { value: 60, label: "1分" },
  { value: 300, label: "5分" },
  { value: 900, label: "15分" },
] as const;

export default function PerformancePage() {
  const [posts, setPosts] = useState<ApiPerformancePost[]>([]);
  const [summary, setSummary] = useState<ApiPerformanceSummary | null>(null);
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [metric, setMetric] = useState<Metric>("likes");
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(60);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [historyByPost, setHistoryByPost] = useState<Record<string, ApiPostMetricsHistoryPoint[]>>({});
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);

  const load = useCallback(async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const [p, s, a] = await Promise.all([
        getPerformanceRanking(metric, 50, accountFilter || undefined),
        getPerformanceSummary(accountFilter || undefined),
        getAccounts(),
      ]);
      setPosts(p);
      setSummary(s);
      setAccounts(a);
      setLastRefreshedAt(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [metric, accountFilter]);

  useEffect(() => { load(false); }, [load]);

  // 自動更新ポーリング
  useEffect(() => {
    if (autoRefreshSec <= 0) return;
    const id = setInterval(() => { void load(true); }, autoRefreshSec * 1000);
    return () => clearInterval(id);
  }, [autoRefreshSec, load]);

  const togglePostExpand = async (postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      return;
    }
    setExpandedPostId(postId);
    if (!historyByPost[postId]) {
      setHistoryLoading(postId);
      try {
        const hist = await getPostMetricsHistory(postId);
        setHistoryByPost((prev) => ({ ...prev, [postId]: hist }));
      } catch (e) {
        console.error(e);
      } finally {
        setHistoryLoading(null);
      }
    }
  };

  // Chart data (top 20)
  const chartData = posts.slice(0, 20).map((p, i) => ({
    name: `#${i + 1}`,
    likes: p.likes ?? 0,
    views: p.views ?? 0,
    reposts: p.reposts ?? 0,
    engagement: Number(((p.engagement_rate ?? 0) * 100).toFixed(2)),
  }));

  const mc = METRIC_CONFIG[metric];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "#e2dff6" }}>
            <Trophy className="h-5 w-5" style={{ color: "#fbbf24" }} />
            投稿パフォーマンスランキング
          </h1>
          <p className="text-xs mt-1" style={{ color: "rgba(240,238,255,0.4)" }}>
            あなたの投稿を分析し、何が効果的かを可視化
          </p>
        </div>
        {/* 自動更新コントロール */}
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => void load(false)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 transition-all"
            style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", color: "#c4b5fd" }}
            title="今すぐ更新"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            更新
          </button>
          <select
            value={autoRefreshSec}
            onChange={(e) => setAutoRefreshSec(Number(e.target.value))}
            className="rounded-lg px-2 py-2 text-xs"
            style={{ background: "rgba(15,12,30,0.8)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.2)" }}
            title="自動更新間隔"
          >
            {REFRESH_INTERVALS.map((opt) => (
              <option key={opt.value} value={opt.value}>自動更新: {opt.label}</option>
            ))}
          </select>
          {lastRefreshedAt && (
            <span style={{ color: "rgba(240,238,255,0.35)" }}>
              {lastRefreshedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl p-3" style={{ background: GLASS.bg, border: GLASS.border }}>
            <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>投稿数</p>
            <p className="text-xl font-bold" style={{ color: "#c4b5fd" }}>{summary.total_posts}</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: GLASS.bg, border: GLASS.border }}>
            <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>平均いいね</p>
            <p className="text-xl font-bold" style={{ color: "#f472b6" }}>{Math.round(summary.avg_likes).toLocaleString()}</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: GLASS.bg, border: GLASS.border }}>
            <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>平均インプ</p>
            <p className="text-xl font-bold" style={{ color: "#60a5fa" }}>{Math.round(summary.avg_impressions).toLocaleString()}</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: GLASS.bg, border: GLASS.border }}>
            <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>最高いいね</p>
            <p className="text-xl font-bold" style={{ color: "#fbbf24" }}>{summary.max_likes.toLocaleString()}</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: GLASS.bg, border: GLASS.border }}>
            <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>最高インプ</p>
            <p className="text-xl font-bold" style={{ color: "#4ade80" }}>{summary.max_impressions.toLocaleString()}</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: GLASS.bg, border: GLASS.border }}>
            <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>平均ENG率</p>
            <p className="text-xl font-bold" style={{ color: "#f87171" }}>{(summary.avg_engagement_rate * 100).toFixed(2)}%</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {(Object.entries(METRIC_CONFIG) as [Metric, typeof METRIC_CONFIG.likes][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setMetric(key)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
            style={metric === key
              ? { background: `${cfg.color}22`, color: cfg.color, border: `1px solid ${cfg.color}44` }
              : { color: "rgba(240,238,255,0.4)", border: "1px solid rgba(139,92,246,0.1)" }
            }
          >
            <cfg.icon className="h-3 w-3" />
            {cfg.label}
          </button>
        ))}

        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="rounded-lg px-3 py-2 text-xs ml-auto"
          style={{ background: "rgba(15,12,30,0.8)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.2)" }}
        >
          <option value="">全アカウント</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>@{a.username}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#a78bfa" }} />
        </div>
      ) : (
        <>
          {/* Top 20 Chart */}
          {chartData.length > 0 && (
            <div className="rounded-xl p-5" style={{ background: GLASS.bg, border: GLASS.border }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: "#c4b5fd" }}>
                TOP 20 - {mc.label}
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                  <Tooltip content={<CustomTooltip />} />
                  {metric === "likes" && <Bar dataKey="likes" name="いいね" fill="#f472b6" radius={[4, 4, 0, 0]} />}
                  {metric === "impressions" && <Bar dataKey="views" name="インプレッショ���" fill="#60a5fa" radius={[4, 4, 0, 0]} />}
                  {metric === "engagement" && <Bar dataKey="engagement" name="ENG率(%)" fill="#fbbf24" radius={[4, 4, 0, 0]} />}
                  {metric === "initial" && <Bar dataKey="likes" name="初回いいね" fill="#4ade80" radius={[4, 4, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Rankings Table */}
          <div className="rounded-xl overflow-hidden" style={{ background: GLASS.bg, border: GLASS.border }}>
            <div className="p-4">
              <h3 className="text-sm font-semibold" style={{ color: "#c4b5fd" }}>ランキング詳細</h3>
            </div>
            <div className="divide-y" style={{ borderColor: "rgba(139,92,246,0.08)" }}>
              {posts.map((post, i) => {
                const expanded = expandedPostId === post.id;
                const history = historyByPost[post.id] ?? [];
                const histPostedAt = post.posted_at ? new Date(post.posted_at).getTime() : null;
                const chartData = history.map((pt) => ({
                  ts: new Date(pt.collectedAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
                  hoursSincePost: histPostedAt ? Math.max(0, (new Date(pt.collectedAt).getTime() - histPostedAt) / 3_600_000) : 0,
                  likes: pt.likes,
                  views: pt.views,
                  reposts: pt.reposts,
                  replies: pt.replies,
                }));
                return (
                  <div key={post.id} className="hover:bg-white/[0.02] transition-colors">
                    <button
                      type="button"
                      onClick={() => void togglePostExpand(post.id)}
                      className="w-full text-left px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5 shrink-0">
                          <RankBadge rank={i + 1} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs leading-relaxed mb-1.5" style={{ color: "rgba(240,238,255,0.75)" }}>
                            {(post.content_text ?? "").substring(0, 150)}
                            {(post.content_text ?? "").length > 150 ? "..." : ""}
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>
                            <span style={{ color: "#f472b6" }}>
                              <Heart className="inline h-3 w-3 mr-0.5" />{(post.likes ?? 0).toLocaleString()}
                            </span>
                            <span style={{ color: "#60a5fa" }}>
                              <Eye className="inline h-3 w-3 mr-0.5" />{(post.views ?? 0).toLocaleString()}
                            </span>
                            <span style={{ color: "#4ade80" }}>
                              ENG {((post.engagement_rate ?? 0) * 100).toFixed(2)}%
                            </span>
                            {post.initial_likes != null && (
                              <span style={{ color: "#fbbf24" }}>
                                初動 {post.initial_likes.toLocaleString()} likes
                              </span>
                            )}
                            <span>@{post.account_username}</span>
                            {post.posted_at && (
                              <span>{new Date(post.posted_at).toLocaleDateString("ja-JP")}</span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 pt-0.5" style={{ color: "rgba(240,238,255,0.4)" }}>
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>
                    </button>
                    {expanded && (
                      <div className="px-4 pb-4">
                        <div className="rounded-lg p-3" style={{ background: "rgba(15,12,30,0.5)", border: "1px solid rgba(139,92,246,0.1)" }}>
                          <p className="text-[11px] mb-2 font-semibold" style={{ color: "#c4b5fd" }}>
                            時系列メトリクス（投稿後の推移）
                          </p>
                          {historyLoading === post.id ? (
                            <div className="flex h-32 items-center justify-center">
                              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#a78bfa" }} />
                            </div>
                          ) : chartData.length < 2 ? (
                            <p className="text-[11px] py-6 text-center" style={{ color: "rgba(240,238,255,0.4)" }}>
                              スナップショットがまだ2件未満です（{chartData.length}件）。投稿後の経過とともに自動収集されます。
                            </p>
                          ) : (
                            <ResponsiveContainer width="100%" height={220}>
                              <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                                <XAxis
                                  dataKey="hoursSincePost"
                                  type="number"
                                  domain={["dataMin", "dataMax"]}
                                  tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }}
                                  label={{ value: "投稿後（時間）", position: "insideBottom", offset: -5, style: { fontSize: 10, fill: "rgba(240,238,255,0.4)" } }}
                                />
                                <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <Line type="monotone" dataKey="likes" name="いいね" stroke="#f472b6" strokeWidth={2} dot={{ r: 2 }} />
                                <Line type="monotone" dataKey="views" name="インプ" stroke="#60a5fa" strokeWidth={2} dot={{ r: 2 }} />
                                <Line type="monotone" dataKey="reposts" name="リポスト" stroke="#4ade80" strokeWidth={2} dot={{ r: 2 }} />
                                <Line type="monotone" dataKey="replies" name="返信" stroke="#fbbf24" strokeWidth={2} dot={{ r: 2 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {posts.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <BarChart2 className="h-10 w-10 mx-auto mb-2" style={{ color: "rgba(240,238,255,0.12)" }} />
                  <p className="text-xs" style={{ color: "rgba(240,238,255,0.35)" }}>
                    投稿してメトリクスを収集すると、パフォーマンスランキングが表示さ��ます
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
