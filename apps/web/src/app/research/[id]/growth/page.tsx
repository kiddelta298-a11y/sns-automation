"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  getAdultGenre,
  getGrowthAnalysis,
  type ApiGrowthData,
} from "@/lib/api";
import {
  ArrowLeft, TrendingUp, Loader2, Zap, Star, Calendar,
  Users, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

const COLORS = ["#a78bfa", "#f472b6", "#60a5fa", "#4ade80", "#fbbf24", "#f87171", "#38bdf8"];

const GLASS = {
  bg: "rgba(15,12,30,0.6)",
  border: "1px solid rgba(139,92,246,0.15)",
};

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

export default function GrowthPage() {
  const params = useParams();
  const router = useRouter();
  const genreId = params.id as string;

  const [genre, setGenre] = useState<{ id: string; name: string } | null>(null);
  const [growthData, setGrowthData] = useState<ApiGrowthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, data] = await Promise.all([
        getAdultGenre(genreId),
        getGrowthAnalysis(genreId),
      ]);
      setGenre(g);
      setGrowthData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [genreId]);

  useEffect(() => { load(); }, [load]);

  const selected = selectedIdx !== null ? growthData[selectedIdx] : null;

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
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/research")}
          className="rounded-lg p-2" style={{ color: "rgba(240,238,255,0.5)" }}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#e2dff6" }}>
            {genre?.name ?? "..."} - 成長分析
          </h1>
          <p className="text-xs" style={{ color: "rgba(240,238,255,0.4)" }}>
            競合アカウントの成長パターンを可視化
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {growthData.map((gd, idx) => {
          const isUp = gd.followerGrowthRate > 0;
          return (
            <div
              key={gd.account.id}
              className="rounded-xl p-4 cursor-pointer transition-all"
              style={{
                background: selectedIdx === idx ? "rgba(139,92,246,0.12)" : GLASS.bg,
                border: selectedIdx === idx ? "1px solid rgba(139,92,246,0.35)" : GLASS.border,
              }}
              onClick={() => setSelectedIdx(selectedIdx === idx ? null : idx)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: "#c4b5fd" }}>@{gd.account.username}</span>
                <div className="flex items-center gap-1 text-xs" style={{ color: isUp ? "#4ade80" : "#f87171" }}>
                  {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(gd.followerGrowthRate).toFixed(1)}%
                </div>
              </div>

              <div className="flex gap-4 text-xs" style={{ color: "rgba(240,238,255,0.5)" }}>
                <span><Users className="inline h-3 w-3 mr-0.5" />{gd.account.followersCount?.toLocaleString() ?? "-"}</span>
                {gd.account.accountCreatedAt && (
                  <span><Calendar className="inline h-3 w-3 mr-0.5" />{gd.account.accountCreatedAt}</span>
                )}
              </div>

              <div className="flex gap-3 mt-2 text-[10px]" style={{ color: "rgba(240,238,255,0.35)" }}>
                <span>{gd.dataPoints}日分のデータ</span>
                <span>{gd.buzzPosts.length}件のバズ投稿</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparative Follower Growth Chart */}
      {growthData.length > 0 && (
        <div className="rounded-xl p-5" style={{ background: GLASS.bg, border: GLASS.border }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "#c4b5fd" }}>
            フォロワー成長比較
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
              <XAxis
                dataKey="snapshotDate"
                type="category"
                allowDuplicatedCategory={false}
                tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }}
              />
              <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "rgba(240,238,255,0.6)" }} />
              {growthData.map((gd, i) => (
                <Line
                  key={gd.account.id}
                  data={gd.dailyData}
                  type="monotone"
                  dataKey="followersCount"
                  name={`@${gd.account.username}`}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Selected Account Detail */}
      {selected && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold" style={{ color: "#e2dff6" }}>
            @{selected.account.username} の詳細分析
          </h2>

          {/* Growth curve */}
          {selected.dailyData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl p-5" style={{ background: GLASS.bg, border: GLASS.border }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: "#a78bfa" }}>フォロワー推移</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={selected.dailyData}>
                    <defs>
                      <linearGradient id="gradGrowth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                    <XAxis dataKey="snapshotDate" tick={{ fontSize: 9, fill: "rgba(240,238,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="followersCount" name="フォロワー" stroke="#a78bfa" fill="url(#gradGrowth)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl p-5" style={{ background: GLASS.bg, border: GLASS.border }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: "#60a5fa" }}>エンゲージメント率推移</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={selected.dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                    <XAxis dataKey="snapshotDate" tick={{ fontSize: 9, fill: "rgba(240,238,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(240,238,255,0.4)" }}
                      tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="engagementRate" name="エンゲージメント率"
                      stroke="#60a5fa" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Buzz Posts - turning points */}
          {selected.buzzPosts.length > 0 && (
            <div className="rounded-xl p-5" style={{ background: GLASS.bg, border: GLASS.border }}>
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-4 w-4" style={{ color: "#fbbf24" }} />
                <h3 className="text-sm font-semibold" style={{ color: "#fbbf24" }}>
                  転機となったバズ投稿 TOP {selected.buzzPosts.length}
                </h3>
              </div>
              <div className="space-y-3">
                {selected.buzzPosts.map((post, i) => (
                  <div key={post.id} className="rounded-lg p-3"
                    style={{ background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.1)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold" style={{ color: "#fbbf24" }}>#{i + 1}</span>
                          <span className="text-xs font-mono" style={{ color: "#fbbf24" }}>
                            BuzzScore: {post.buzzScore.toFixed(4)}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.75)" }}>
                          {post.contentText.substring(0, 200)}{post.contentText.length > 200 ? "..." : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right space-y-0.5">
                        <p className="text-xs" style={{ color: "#f472b6" }}>
                          {post.likeCount.toLocaleString()} likes
                        </p>
                        <p className="text-xs" style={{ color: "#60a5fa" }}>
                          {post.viewCount.toLocaleString()} views
                        </p>
                        <p className="text-xs" style={{ color: "#4ade80" }}>
                          {post.repostCount.toLocaleString()} reposts
                        </p>
                      </div>
                    </div>
                    {post.postedAt && (
                      <p className="text-[10px] mt-2" style={{ color: "rgba(240,238,255,0.3)" }}>
                        投稿日: {new Date(post.postedAt).toLocaleDateString("ja-JP")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Account Info Summary */}
          <div className="rounded-xl p-5" style={{ background: GLASS.bg, border: GLASS.border }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "#c4b5fd" }}>アカウント情報</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>ユーザーネーム</p>
                <p className="text-sm font-medium" style={{ color: "#e2dff6" }}>@{selected.account.username}</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>開設日</p>
                <p className="text-sm font-medium" style={{ color: "#e2dff6" }}>{selected.account.accountCreatedAt ?? "不明"}</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>フォロワー</p>
                <p className="text-sm font-medium" style={{ color: "#e2dff6" }}>{selected.account.followersCount?.toLocaleString() ?? "-"}</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>フォロワー成長率</p>
                <p className="text-sm font-medium" style={{
                  color: selected.followerGrowthRate > 0 ? "#4ade80" : "#f87171"
                }}>
                  {selected.followerGrowthRate > 0 ? "+" : ""}{selected.followerGrowthRate.toFixed(1)}%
                </p>
              </div>
            </div>
            {selected.account.bio && (
              <div className="mt-3">
                <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>プロフィール</p>
                <p className="text-xs mt-1" style={{ color: "rgba(240,238,255,0.65)" }}>{selected.account.bio}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {growthData.length === 0 && (
        <div className="rounded-xl p-8 text-center" style={{ background: GLASS.bg, border: GLASS.border }}>
          <TrendingUp className="h-12 w-12 mx-auto mb-3" style={{ color: "rgba(240,238,255,0.15)" }} />
          <p className="text-sm" style={{ color: "rgba(240,238,255,0.4)" }}>
            参考アカウントを登録し、監視を実行すると成長分析が表示されます
          </p>
        </div>
      )}
    </div>
  );
}
