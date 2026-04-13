"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getMetrics, analyzeJob, getWinningPattern, type ApiMetrics, type ApiWinningPattern } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, BarChart3, TrendingUp, Hash, Clock, FileText,
  Heart, Repeat2, MessageSquare, Eye, Lightbulb, AlertTriangle,
  Sparkles, Loader2, ChevronRight, Target, Zap,
} from "lucide-react";

const FORMAT_LABELS: Record<string, string> = {
  question: "問いかけ型", list: "リスト型", story: "体験談型",
  opinion: "主張型", punchline: "オチ型", other: "その他",
};
const FORMAT_COLORS: Record<string, string> = {
  question: "bg-blue-500", list: "bg-violet-500", story: "bg-amber-500",
  opinion: "bg-rose-500", punchline: "bg-emerald-500", other: "bg-gray-400",
};

function StatCard({ label, value, sub, icon: Icon, color = "text-primary" }: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn("mt-1 text-2xl font-bold", color)}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className="rounded-lg bg-accent p-2">
          <Icon className={cn("h-5 w-5", color)} />
        </div>
      </div>
    </div>
  );
}

export default function MetricsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();

  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [pattern, setPattern] = useState<ApiWinningPattern | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const m = await getMetrics(jobId);
        setMetrics(m);
        const p = await getWinningPattern(jobId).catch(() => null);
        setPattern(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : "データ取得に失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await analyzeJob(jobId);
      const p = await getWinningPattern(jobId);
      setPattern(p);
    } catch (e) {
      alert(e instanceof Error ? e.message : "分析失敗");
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-32 gap-3">
      <AlertTriangle className="h-10 w-10 text-red-400" />
      <p className="text-sm text-muted-foreground">{error}</p>
      <Link href="/trends" className="text-sm text-primary hover:underline">← トレンドページへ戻る</Link>
    </div>
  );

  if (!metrics) return null;
  const { summary, top10, formatStats, charBands, topKeywords, hourStats } = metrics;
  const report = pattern?.analysisReport;

  // 最大バンド（グラフ表示用）
  const maxFmtCount = Math.max(...formatStats.map(f => f.count), 1);
  const maxKwCount = Math.max(...topKeywords.slice(0, 20).map(k => k.count), 1);
  const maxHourBuzz = Math.max(...hourStats.map(h => h.avgBuzz), 0.0001);

  // ベスト投稿時間帯トップ3
  const bestHours = [...hourStats].sort((a, b) => b.avgBuzz - a.avgBuzz).slice(0, 3);

  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Link href="/trends" className="rounded-lg p-1.5 hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">{metrics.job.industry?.name} — 分析レポート</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">{summary.totalPosts}件の投稿を分析</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !!pattern}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none",
              pattern
                ? "bg-muted text-muted-foreground cursor-default"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {pattern ? "AI分析済み" : analyzing ? "AI分析中..." : "AIで深く分析"}
          </button>
          <button
            onClick={() => router.push(`/trends/${jobId}`)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors sm:flex-none"
          >
            投稿生成へ <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── サマリーカード ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="収集投稿数"    value={`${summary.totalPosts}件`}           icon={FileText}   />
        <StatCard label="平均バズスコア" value={summary.avgBuzzScore.toFixed(4)}      icon={TrendingUp} color="text-blue-500" />
        <StatCard label="最大バズスコア" value={summary.maxBuzzScore.toFixed(4)}      icon={Zap}        color="text-amber-500" />
        <StatCard label="平均文字数"    value={`${summary.avgCharCount}字`}           icon={FileText}   color="text-violet-500" />
        <StatCard label="画像投稿率"    value={`${summary.imagePostPct}%`}            icon={BarChart3}  color="text-emerald-500" sub="画像あり投稿の割合" />
      </div>

      {/* ── TOP 10 バズ投稿 ── */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
          <TrendingUp className="h-5 w-5 text-primary" /> TOP 10 バズ投稿
        </h2>
        <div className="space-y-3">
          {top10.map((post, i) => (
            <div key={post.id} className="flex gap-4 rounded-xl border border-border bg-card p-4">
              <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                i === 0 ? "bg-amber-400 text-white" : i === 1 ? "bg-slate-300 text-white" : i === 2 ? "bg-orange-300 text-white" : "bg-muted text-muted-foreground",
              )}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs text-white font-medium", FORMAT_COLORS[post.postFormat ?? "other"] ?? "bg-gray-400")}>
                    {FORMAT_LABELS[post.postFormat ?? "other"]}
                  </span>
                  <span className="text-xs text-muted-foreground">{post.charCount}字</span>
                  {post.authorUsername && <span className="text-xs text-muted-foreground">@{post.authorUsername}</span>}
                </div>
                <p className="text-sm text-foreground whitespace-pre-line leading-relaxed line-clamp-4">
                  {post.contentText}
                </p>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{formatNumber(post.likeCount)}</span>
                  <span className="flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" />{formatNumber(post.repostCount)}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{formatNumber(post.replyCount)}</span>
                  <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{formatNumber(post.viewCount)}</span>
                  <span className="ml-auto font-semibold text-primary">スコア: {post.buzzScore.toFixed(4)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── フォーマット分布 ── */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <BarChart3 className="h-5 w-5 text-primary" /> 投稿フォーマット分析
          </h2>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            {formatStats.map(f => (
              <div key={f.format}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("h-2.5 w-2.5 rounded-full", FORMAT_COLORS[f.format] ?? "bg-gray-400")} />
                    <span className="font-medium text-foreground">{FORMAT_LABELS[f.format] ?? f.format}</span>
                  </span>
                  <span className="text-muted-foreground">{f.count}件 ({f.pct}%) | 平均スコア: <strong className="text-foreground">{f.avgBuzzScore}</strong></span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", FORMAT_COLORS[f.format] ?? "bg-gray-400")}
                    style={{ width: `${(f.count / maxFmtCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 文字数分析 ── */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <FileText className="h-5 w-5 text-primary" /> 文字数帯 × バズスコア
          </h2>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            {charBands.map(band => {
              const maxBand = Math.max(...charBands.map(b => b.avgBuzzScore), 0.0001);
              const isOptimal = band.avgBuzzScore === Math.max(...charBands.map(b => b.avgBuzzScore));
              return (
                <div key={band.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      {isOptimal && <Target className="h-3.5 w-3.5 text-primary" />}
                      {band.label}
                    </span>
                    <span className="text-muted-foreground">
                      {band.count}件 | <strong className="text-foreground">{band.avgBuzzScore}</strong>
                      {isOptimal && <span className="ml-1 text-primary font-semibold">← 最適</span>}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", isOptimal ? "bg-primary" : "bg-blue-300")}
                      style={{ width: `${(band.avgBuzzScore / maxBand) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 頻出キーワード ── */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <Hash className="h-5 w-5 text-primary" /> バズ投稿の頻出ワード TOP 20
          </h2>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap gap-2">
              {topKeywords.slice(0, 20).map((kw, i) => {
                const size = i < 3 ? "text-base font-bold" : i < 8 ? "text-sm font-semibold" : "text-xs";
                const opacity = 1 - (i / 20) * 0.5;
                return (
                  <span
                    key={kw.word}
                    className={cn("rounded-full px-3 py-1 bg-primary/10 text-primary", size)}
                    style={{ opacity }}
                    title={`${kw.count}件 (${kw.pct}%)`}
                  >
                    {kw.word}
                  </span>
                );
              })}
            </div>
            {/* ランキング表 */}
            <div className="mt-4 space-y-1.5">
              {topKeywords.slice(0, 10).map((kw, i) => (
                <div key={kw.word} className="flex items-center gap-2 text-xs">
                  <span className="w-5 text-center text-muted-foreground font-mono">{i + 1}</span>
                  <span className="flex-1 font-medium text-foreground">{kw.word}</span>
                  <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(kw.count / maxKwCount) * 100}%` }} />
                  </div>
                  <span className="w-12 text-right text-muted-foreground">{kw.count}件</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 投稿時間帯 ── */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <Clock className="h-5 w-5 text-primary" /> 投稿時間帯 × バズスコア
          </h2>
          <div className="rounded-xl border border-border bg-card p-4">
            {/* 24時間グリッド */}
            <div className="flex items-end gap-0.5 h-24">
              {Array.from({ length: 24 }, (_, h) => {
                const stat = hourStats.find(s => s.hour === h);
                const height = stat ? (stat.avgBuzz / maxHourBuzz) * 100 : 0;
                const isBest = bestHours.some(b => b.hour === h);
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-0.5" title={`${h}時: avg ${stat?.avgBuzz.toFixed(4) ?? "—"}`}>
                    <div className="w-full rounded-t" style={{
                      height: `${height}%`,
                      backgroundColor: isBest ? "rgb(var(--primary))" : "rgb(var(--muted-foreground) / 0.3)",
                      minHeight: height > 0 ? "3px" : "0",
                    }} />
                    {h % 6 === 0 && <span className="text-[10px] text-muted-foreground">{h}</span>}
                  </div>
                );
              })}
            </div>
            {/* ベスト時間帯 */}
            <div className="mt-3 flex gap-2 flex-wrap">
              {bestHours.map((h, i) => (
                <span key={h.hour} className={cn(
                  "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
                  i === 0 ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                )}>
                  <Clock className="h-3 w-3" />{h.hour}時台
                  {i === 0 && " (最適)"}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ── AI 勝ちパターン分析（あれば表示） ── */}
      {pattern && report && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <Sparkles className="h-5 w-5 text-primary" /> AI 勝ちパターン分析
          </h2>
          <div className="space-y-4">
            {/* サマリー */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
              <p className="text-sm leading-relaxed text-foreground">{report.summary}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* インサイト */}
              {report.keyInsights && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Lightbulb className="h-4 w-4 text-amber-500" /> 重要インサイト
                  </h3>
                  <ul className="space-y-2">
                    {report.keyInsights.map((ins, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{ins}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* フックパターン */}
              {report.hookPatterns && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Zap className="h-4 w-4 text-blue-500" /> 効果的なフック（冒頭）
                  </h3>
                  <ul className="space-y-2">
                    {report.hookPatterns.map((h, i) => (
                      <li key={i} className="rounded-lg bg-muted px-3 py-2 text-xs font-medium text-foreground">{h}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 改善策・避けるパターン */}
              {report.avoidPatterns && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <AlertTriangle className="h-4 w-4 text-red-400" /> 避けるべきパターン（改善点）
                  </h3>
                  <ul className="space-y-2">
                    {report.avoidPatterns.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 投稿戦略 */}
              {report.postingAdvice && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Target className="h-4 w-4 text-emerald-500" /> 投稿戦略アドバイス
                  </h3>
                  <p className="text-xs leading-relaxed text-foreground">{report.postingAdvice}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* AI分析ボタン（未分析時） */}
      {!pattern && (
        <section className="rounded-xl border-2 border-dashed border-border p-8 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            AIによる深い分析（共通点・フックパターン・改善策）を実行できます
          </p>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-2 mx-auto rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analyzing ? "AI分析中（30秒ほど）..." : "AIで勝ちパターンを分析"}
          </button>
        </section>
      )}
    </div>
  );
}
