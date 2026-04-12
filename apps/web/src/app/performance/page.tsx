"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  getPerformanceRanking,
  getPerformanceSummary,
  getAccounts,
  type ApiPerformancePost,
  type ApiPerformanceSummary,
  type ApiAccount,
} from "@/lib/api";
import {
  Trophy, Heart, Eye, TrendingUp, Zap, Loader2, BarChart2,
  ArrowUpRight, Crown, Medal, Award,
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

export default function PerformancePage() {
  const [posts, setPosts] = useState<ApiPerformancePost[]>([]);
  const [summary, setSummary] = useState<ApiPerformanceSummary | null>(null);
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [metric, setMetric] = useState<Metric>("likes");
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, a] = await Promise.all([
        getPerformanceRanking(metric, 50, accountFilter || undefined),
        getPerformanceSummary(accountFilter || undefined),
        getAccounts(),
      ]);
      setPosts(p);
      setSummary(s);
      setAccounts(a);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [metric, accountFilter]);

  useEffect(() => { load(); }, [load]);

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
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "#e2dff6" }}>
          <Trophy className="h-5 w-5" style={{ color: "#fbbf24" }} />
          投稿パフォーマンスランキ��グ
        </h1>
        <p className="text-xs mt-1" style={{ color: "rgba(240,238,255,0.4)" }}>
          あなたの投稿を分析し、何が効果的かを可視化
        </p>
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
              {posts.map((post, i) => (
                <div key={post.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
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
                  </div>
                </div>
              ))}
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
