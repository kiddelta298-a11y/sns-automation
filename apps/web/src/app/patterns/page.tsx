"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getIndustries,
  getKnowledge,
  type ApiIndustry,
  type ApiBuzzKeyword,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Trophy, TrendingUp, Flame, Clock, Loader2, RefreshCw, ChevronRight, Target,
} from "lucide-react";

const INDUSTRY_EMOJI: Record<string, string> = {
  business: "💼", marketing: "📣", tech: "💻", finance: "💰",
  beauty: "✨", fitness: "💪", food: "🍜", parenting: "👶",
  "self-improvement": "🌱", creator: "🎨", adult: "🔞",
};

type SortKey = "winScore" | "occurrences" | "avgBuzz" | "recent";

const SORT_LABELS: Record<SortKey, { label: string; icon: React.ComponentType<{ className?: string }>; desc: string }> = {
  winScore:    { label: "勝ちスコア",   icon: Trophy,     desc: "出現頻度 × 平均バズスコア。総合評価。" },
  occurrences: { label: "出現回数",     icon: Flame,      desc: "どれだけ繰り返し登場しているか" },
  avgBuzz:     { label: "平均バズ",     icon: TrendingUp, desc: "含まれた投稿の伸び率" },
  recent:      { label: "最新登場",     icon: Clock,      desc: "直近で登場したワード" },
};

export default function PatternsPage() {
  const [industries, setIndustries] = useState<ApiIndustry[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("winScore");
  const [keywords, setKeywords] = useState<ApiBuzzKeyword[]>([]);
  const [summary, setSummary] = useState<{ totalKeywords: number; totalJobs: number; avgWinScore: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await getIndustries();
        setIndustries(list);
      } catch {}
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getKnowledge({
        industryId: selectedIndustry || undefined,
        sortBy: sortKey,
        limit: 100,
      });
      setKeywords(data.keywords);
      setSummary(data.summary);
    } catch {
      setKeywords([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [selectedIndustry, sortKey]);

  useEffect(() => { load(); }, [load]);

  const maxWinScore = Math.max(...keywords.map(k => k.winScore), 0.0001);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          勝ちパターン・ナレッジ
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          全ジョブで蓄積したバズワードを分析し、勝ちパターンをPDCAで発見します
        </p>
      </div>

      {/* サマリー */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">蓄積ワード数</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{summary.totalKeywords}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">平均勝ちスコア</p>
            <p className="mt-1 text-2xl font-bold text-primary">{summary.avgWinScore.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">絞り込み中</p>
            <p className="mt-1 text-sm font-semibold text-foreground truncate">
              {selectedIndustry
                ? industries.find(i => i.id === selectedIndustry)?.name ?? "—"
                : "全業界"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">ソート</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{SORT_LABELS[sortKey].label}</p>
          </div>
        </div>
      )}

      {/* 業界フィルタ */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          ジャンルで絞り込み
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedIndustry("")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
              !selectedIndustry
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            全業界
          </button>
          {industries.map(ind => (
            <button
              key={ind.id}
              onClick={() => setSelectedIndustry(ind.id)}
              className={cn(
                "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                selectedIndustry === ind.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
            >
              <span>{INDUSTRY_EMOJI[ind.slug] ?? "📌"}</span>
              {ind.name}
            </button>
          ))}
        </div>
      </section>

      {/* ソート */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            並び替え
          </h2>
          <button
            onClick={load}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 更新
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(SORT_LABELS) as SortKey[]).map(key => {
            const { label, icon: Icon } = SORT_LABELS[key];
            const active = sortKey === key;
            return (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          <Target className="inline h-3 w-3 mr-1" />
          {SORT_LABELS[sortKey].desc}
        </p>
      </section>

      {/* ランキング */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          ランキング（TOP {keywords.length}）
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : keywords.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <Trophy className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              まだ蓄積されたキーワードがありません
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              トレンド収集を実行して「AIで深く分析」すると、勝ちワードが自動で蓄積されます
            </p>
            <Link
              href="/trends"
              className="mt-4 inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              トレンド収集へ <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
            {keywords.map((kw, i) => {
              const barPct = Math.max(2, (kw.winScore / maxWinScore) * 100);
              return (
                <div key={kw.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      i === 0 ? "bg-amber-400 text-white"
                      : i === 1 ? "bg-slate-300 text-white"
                      : i === 2 ? "bg-orange-300 text-white"
                      : "bg-muted text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {kw.keyword}
                      </span>
                      <span className="text-xs font-bold text-primary whitespace-nowrap">
                        WS: {kw.winScore.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${barPct}%` }} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>出現 <strong className="text-foreground">{kw.occurrences}</strong></span>
                      <span>投稿 <strong className="text-foreground">{kw.postCount}</strong></span>
                      <span>平均バズ <strong className="text-foreground">{kw.avgBuzzScore.toFixed(3)}</strong></span>
                      <span>ジョブ <strong className="text-foreground">{kw.jobCount}</strong></span>
                      {kw.industry && (
                        <span className="ml-auto">
                          {INDUSTRY_EMOJI[kw.industry.slug] ?? "📌"} {kw.industry.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
