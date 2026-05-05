"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, BarChart2, Users, TrendingUp, Calendar as CalendarIcon } from "lucide-react";
import { getAffiliateDashboard, type ApiAffiliateDashboard } from "@/lib/api";

const GLASS = {
  card: { background: "rgba(15,12,30,0.7)", border: "1px solid rgba(139,92,246,0.15)" },
  inner: { background: "rgba(15,12,30,0.5)", border: "1px solid rgba(139,92,246,0.1)" },
  input: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(139,92,246,0.2)",
    color: "rgba(240,238,255,0.85)",
  },
} as const;

type RangeKey = "7d" | "30d" | "all" | "custom";

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AffiliateDashboardPage() {
  const [data, setData] = useState<ApiAffiliateDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (range === "all") return { from: undefined, to: undefined };
    if (range === "7d") {
      const f = new Date(now); f.setDate(f.getDate() - 7);
      return { from: ymd(f), to: ymd(now) };
    }
    if (range === "30d") {
      const f = new Date(now); f.setDate(f.getDate() - 30);
      return { from: ymd(f), to: ymd(now) };
    }
    return { from: customFrom || undefined, to: customTo || undefined };
  }, [range, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getAffiliateDashboard(from, to);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込み失敗");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  // ヒートマップ最大値
  const heatmapMax = data?.heatmap.reduce((m, h) => Math.max(m, h.clicks), 0) ?? 0;
  const heatmapByCell = useMemo(() => {
    const map = new Map<string, number>();
    data?.heatmap.forEach((h) => map.set(`${h.dow}:${h.hour}`, h.clicks));
    return map;
  }, [data?.heatmap]);

  return (
    <div className="min-h-screen p-6 space-y-6"
      style={{ background: "linear-gradient(180deg, #0a0819 0%, #0d0a1e 100%)" }}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" style={{
              background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              アフィリエイト分析ダッシュボード
            </h1>
            <p className="text-sm mt-1" style={{ color: "rgba(240,238,255,0.55)" }}>
              案件別ROAS / アカウント別CVR / 時間帯ヒートマップ
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex gap-1 rounded-lg p-1"
              style={{ background: "rgba(15,12,30,0.5)", border: "1px solid rgba(139,92,246,0.15)" }}>
              {(["7d", "30d", "all", "custom"] as const).map((k) => (
                <button key={k} onClick={() => setRange(k)}
                  className="rounded-md px-3 py-1.5 transition-all"
                  style={range === k ? {
                    background: "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(168,85,247,0.4))",
                    color: "#e9d5ff",
                  } : { color: "rgba(240,238,255,0.5)" }}>
                  {k === "7d" ? "過去7日" : k === "30d" ? "過去30日" : k === "all" ? "全期間" : "カスタム"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {range === "custom" && (
          <div className="flex items-center gap-2 flex-wrap rounded-lg p-3"
            style={{ background: "rgba(15,12,30,0.6)", border: "1px solid rgba(139,92,246,0.15)" }}>
            <CalendarIcon className="h-4 w-4" style={{ color: "rgba(139,92,246,0.6)" }} />
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-md px-2 py-1.5 text-xs" style={GLASS.input} />
            <span style={{ color: "rgba(240,238,255,0.4)" }}>〜</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-md px-2 py-1.5 text-xs" style={GLASS.input} />
          </div>
        )}

        {error && (
          <div className="rounded-lg px-3 py-2 text-sm"
            style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.4)", color: "#fda4af" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#a78bfa" }} />
          </div>
        ) : !data ? (
          <p className="text-sm" style={{ color: "rgba(240,238,255,0.5)" }}>データがありません</p>
        ) : (
          <>
            {/* 案件別ROAS */}
            <section>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: "#c4b5fd" }}>
                <BarChart2 className="h-4 w-4" />案件別ROAS
              </h2>
              <div className="rounded-2xl overflow-hidden" style={GLASS.card}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(139,92,246,0.15)" }}>
                        {["案件", "ASP", "クリック", "CV", "売上", "CVR", "想定ROAS"].map((h, i) => (
                          <th key={i} className={`px-3 py-3 text-xs font-semibold ${i >= 2 ? "text-right" : "text-left"}`}
                            style={{ color: "rgba(240,238,255,0.5)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.linkRoas.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-xs"
                            style={{ color: "rgba(240,238,255,0.35)" }}>
                            データがありません
                          </td>
                        </tr>
                      ) : data.linkRoas.map((l) => {
                        const expectedRevenue = (l.cv ?? 0) * (l.unit_payout ?? 0);
                        return (
                          <tr key={l.id} style={{ borderBottom: "1px solid rgba(139,92,246,0.06)" }}>
                            <td className="px-3 py-3" style={{ color: "rgba(240,238,255,0.85)" }}>{l.case_name}</td>
                            <td className="px-3 py-3" style={{ color: "rgba(240,238,255,0.6)" }}>{l.asp}</td>
                            <td className="px-3 py-3 text-right" style={{ color: "#60a5fa" }}>{l.clicks.toLocaleString()}</td>
                            <td className="px-3 py-3 text-right" style={{ color: "#4ade80" }}>{l.cv.toLocaleString()}</td>
                            <td className="px-3 py-3 text-right" style={{ color: "#fbbf24" }}>
                              ¥{(l.revenue || expectedRevenue).toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right" style={{ color: "rgba(240,238,255,0.7)" }}>
                              {(l.cvr * 100).toFixed(2)}%
                            </td>
                            <td className="px-3 py-3 text-right" style={{ color: "rgba(240,238,255,0.7)" }}>
                              {l.unit_payout ? `¥${l.unit_payout.toLocaleString()} × CV` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* アカウント別CVR */}
            <section>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: "#c4b5fd" }}>
                <Users className="h-4 w-4" />アカウント別パフォーマンス
              </h2>
              <div className="rounded-2xl overflow-hidden" style={GLASS.card}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(139,92,246,0.15)" }}>
                        {["アカウント", "プラットフォーム", "ストーリー数", "クリック", "CV", "CVR"].map((h, i) => (
                          <th key={i} className={`px-3 py-3 text-xs font-semibold ${i >= 2 ? "text-right" : "text-left"}`}
                            style={{ color: "rgba(240,238,255,0.5)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.accountCvr.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-xs"
                            style={{ color: "rgba(240,238,255,0.35)" }}>
                            データがありません
                          </td>
                        </tr>
                      ) : data.accountCvr.map((a) => {
                        const cvr = a.clicks > 0 ? (a.cv / a.clicks) * 100 : 0;
                        return (
                          <tr key={a.id} style={{ borderBottom: "1px solid rgba(139,92,246,0.06)" }}>
                            <td className="px-3 py-3" style={{ color: "rgba(240,238,255,0.85)" }}>@{a.username}</td>
                            <td className="px-3 py-3" style={{ color: "rgba(240,238,255,0.6)" }}>{a.platform}</td>
                            <td className="px-3 py-3 text-right" style={{ color: "rgba(240,238,255,0.7)" }}>{a.story_count.toLocaleString()}</td>
                            <td className="px-3 py-3 text-right" style={{ color: "#60a5fa" }}>{a.clicks.toLocaleString()}</td>
                            <td className="px-3 py-3 text-right" style={{ color: "#4ade80" }}>{a.cv.toLocaleString()}</td>
                            <td className="px-3 py-3 text-right" style={{ color: "rgba(240,238,255,0.7)" }}>{cvr.toFixed(2)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* 時間帯ヒートマップ */}
            <section>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: "#c4b5fd" }}>
                <TrendingUp className="h-4 w-4" />クリック密度ヒートマップ（曜日 × 時間帯）
              </h2>
              <div className="rounded-2xl p-4" style={GLASS.card}>
                {heatmapMax === 0 ? (
                  <p className="text-xs text-center py-8" style={{ color: "rgba(240,238,255,0.35)" }}>
                    クリックデータがありません
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="text-[10px]">
                      <thead>
                        <tr>
                          <th className="px-1 py-1"></th>
                          {Array.from({ length: 24 }).map((_, h) => (
                            <th key={h} className="px-1 py-1 text-center" style={{ color: "rgba(240,238,255,0.4)", width: 22 }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DOW_LABELS.map((dowLabel, dow) => (
                          <tr key={dow}>
                            <td className="px-1 py-0.5 text-right" style={{ color: "rgba(240,238,255,0.4)" }}>{dowLabel}</td>
                            {Array.from({ length: 24 }).map((_, h) => {
                              const v = heatmapByCell.get(`${dow}:${h}`) ?? 0;
                              const intensity = heatmapMax > 0 ? v / heatmapMax : 0;
                              return (
                                <td key={h} className="text-center" style={{ width: 22 }}>
                                  <div className="rounded"
                                    style={{
                                      background: v === 0 ? "rgba(255,255,255,0.03)" : `rgba(168,85,247,${0.15 + intensity * 0.85})`,
                                      width: 18, height: 18, display: "inline-block", lineHeight: "18px",
                                      color: intensity > 0.5 ? "#fff" : "rgba(240,238,255,0.55)",
                                      fontSize: 9,
                                    }}
                                    title={`${dowLabel} ${h}時: ${v}クリック`}
                                  >
                                    {v > 0 ? v : ""}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
