"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getIndustries, seedIndustries, startCollection, getCollectionJob, getCollectionJobs,
  type ApiIndustry, type ApiCollectionJob,
} from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Play, Loader2, CheckCircle2, XCircle, Clock,
  ChevronRight, BarChart3, RefreshCw, AlertCircle,
} from "lucide-react";

// 業界アイコン絵文字マップ
const INDUSTRY_EMOJI: Record<string, string> = {
  business: "💼", marketing: "📣", tech: "💻", finance: "💰",
  beauty: "✨", fitness: "💪", food: "🍜", parenting: "👶",
  "self-improvement": "🌱", creator: "🎨",
};

// 収集の推定時間（秒）: キーワード数 × 45秒 + フィード 120秒
function estimateSeconds(keywords: string[], targetCount: number): number {
  return keywords.length * 45 + 120 + Math.ceil(targetCount / 50) * 10;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `約${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `約${m}分${s}秒` : `約${m}分`;
}

function formatEta(startedAt: string | null, collectedCount: number, targetCount: number): string {
  if (!startedAt || collectedCount === 0) return "計算中...";
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
  const rate = collectedCount / elapsed; // 件/秒
  if (rate <= 0) return "計算中...";
  const remaining = (targetCount - collectedCount) / rate;
  if (remaining <= 0) return "まもなく完了";
  return formatDuration(Math.round(remaining));
}

export default function TrendsPage() {
  const router = useRouter();
  const [industries, setIndustries] = useState<ApiIndustry[]>([]);
  const [selected, setSelected] = useState<ApiIndustry | null>(null);
  const [jobs, setJobs] = useState<ApiCollectionJob[]>([]);
  const [loadingIndustries, setLoadingIndustries] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ApiCollectionJob | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // 業界読み込み
  useEffect(() => {
    (async () => {
      try {
        let list = await getIndustries();
        if (list.length === 0) { await seedIndustries(); list = await getIndustries(); }
        setIndustries(list);
        setSelected(list[0] ?? null);
      } finally {
        setLoadingIndustries(false);
      }
    })();
  }, []);

  // ジョブ履歴読み込み
  const loadJobs = useCallback(async () => {
    if (!selected) return;
    const j = await getCollectionJobs(selected.id).catch(() => []);
    setJobs(j);
    const running = j.find(x => x.status === "running" || x.status === "pending");
    if (running) {
      setActiveJobId(running.id);
    }
  }, [selected]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // アクティブジョブのポーリング（2秒間隔）
  useEffect(() => {
    if (!activeJobId) { setActiveJob(null); return; }
    const poll = async () => {
      const j = await getCollectionJob(activeJobId).catch(() => null);
      if (!j) return;
      setActiveJob(j);
      if (j.status === "completed" || j.status === "failed") {
        setActiveJobId(null);
        loadJobs();
      }
    };
    poll();
    pollingRef.current = setInterval(poll, 2000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [activeJobId, loadJobs]);

  const handleStart = async () => {
    if (!selected || collecting) return;
    setCollecting(true);
    try {
      const { jobId } = await startCollection(selected.id, 500);
      setActiveJobId(jobId);
      await loadJobs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "収集開始に失敗しました");
    } finally {
      setCollecting(false);
    }
  };

  const isRunning = activeJob?.status === "running" || activeJob?.status === "pending";
  const progress = activeJob
    ? Math.min(100, Math.round((activeJob.collectedCount / activeJob.targetCount) * 100))
    : 0;

  return (
    <div className="space-y-8">
      {/* ページヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          トレンド収集・分析
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          業界を選択してバズ投稿を収集し、勝ちパターンを分析します
        </p>
      </div>

      {/* ── Step1: 業界選択 ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Step 1 — 業界を選択
        </h2>
        {loadingIndustries ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {industries.map(ind => (
              <button
                key={ind.id}
                onClick={() => setSelected(ind)}
                disabled={isRunning}
                className={cn(
                  "relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all",
                  "hover:border-primary/60 hover:bg-accent/50",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  selected?.id === ind.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card",
                )}
              >
                <span className="text-2xl">{INDUSTRY_EMOJI[ind.slug] ?? "📌"}</span>
                <span className={cn(
                  "text-xs font-medium leading-tight",
                  selected?.id === ind.id ? "text-primary" : "text-foreground",
                )}>
                  {ind.name}
                </span>
                {selected?.id === ind.id && (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Step2: 収集設定＆実行 ── */}
      {selected && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Step 2 — 収集を実行
          </h2>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-2">
                <p className="font-semibold text-foreground">
                  {INDUSTRY_EMOJI[selected.slug] ?? "📌"} {selected.name}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(selected.keywords as string[]).map(kw => (
                    <span key={kw} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                      #{kw}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  目標収集数：<strong className="text-foreground">500件</strong>
                  推定所要時間：<strong className="text-foreground">
                    {formatDuration(estimateSeconds(selected.keywords as string[], 500))}
                  </strong>
                </p>
              </div>
              <button
                onClick={handleStart}
                disabled={collecting || isRunning}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all",
                  "focus:outline-none focus:ring-2 focus:ring-primary/40",
                  collecting || isRunning
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-lg",
                )}
              >
                {collecting || isRunning
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {isRunning ? "収集中..." : "開始中..."}</>
                  : <><Play className="h-4 w-4" /> 収集開始</>
                }
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── リアルタイム進捗 ── */}
      {activeJob && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            収集中 — リアルタイム進捗
          </h2>
          <div className={cn(
            "rounded-xl border-2 p-5 space-y-4",
            activeJob.status === "completed" ? "border-green-500/40 bg-green-500/5"
            : activeJob.status === "failed" ? "border-red-500/40 bg-red-500/5"
            : "border-primary/40 bg-primary/5",
          )}>
            {/* ステータス行 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeJob.status === "completed" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : activeJob.status === "failed" ? (
                  <XCircle className="h-5 w-5 text-red-500" />
                ) : (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                )}
                <span className="font-semibold text-foreground">
                  {activeJob.status === "completed" ? "収集完了！"
                   : activeJob.status === "failed" ? "収集失敗"
                   : activeJob.status === "running" ? "Threadsからデータを収集中..."
                   : "開始待機中..."}
                </span>
              </div>
              <span className="text-lg font-bold text-primary">{progress}%</span>
            </div>

            {/* プログレスバー */}
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  activeJob.status === "completed" ? "bg-green-500"
                  : activeJob.status === "failed" ? "bg-red-500"
                  : "bg-primary",
                )}
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* 数値 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "収集済み",   value: `${activeJob.collectedCount}件` },
                { label: "目標",       value: `${activeJob.targetCount}件` },
                { label: "残り推定",   value: isRunning ? formatEta(activeJob.startedAt, activeJob.collectedCount, activeJob.targetCount) : "—" },
                { label: "経過時間",   value: activeJob.startedAt ? formatDuration(Math.round((Date.now() - new Date(activeJob.startedAt).getTime()) / 1000)) : "—" },
              ].map(item => (
                <div key={item.label} className="rounded-lg bg-background/60 p-3 text-center">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-0.5 text-base font-bold text-foreground">{item.value}</p>
                </div>
              ))}
            </div>

            {/* フェーズ表示 */}
            {isRunning && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">収集フェーズ</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "キーワード検索", done: activeJob.collectedCount > (activeJob.targetCount * 0.1) },
                    { label: "おすすめフィード", done: activeJob.collectedCount > (activeJob.targetCount * 0.7) },
                    { label: "重複除去・保存", done: activeJob.collectedCount >= activeJob.targetCount },
                  ].map(phase => (
                    <span key={phase.label} className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                      phase.done ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground",
                    )}>
                      {phase.done
                        ? <CheckCircle2 className="h-3 w-3" />
                        : <Loader2 className="h-3 w-3 animate-spin" />
                      }
                      {phase.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 完了後のアクション */}
            {activeJob.status === "completed" && (
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => router.push(`/trends/${activeJob.id}/metrics`)}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <BarChart3 className="h-4 w-4" />
                  分析結果を見る
                </button>
                <button
                  onClick={() => router.push(`/trends/${activeJob.id}`)}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  投稿文を生成する
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* エラー */}
            {activeJob.status === "failed" && activeJob.errorMessage && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-600">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {activeJob.errorMessage}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 収集履歴 ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            収集履歴
          </h2>
          <button onClick={loadJobs} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> 更新
          </button>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
          {jobs.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              収集履歴がありません。上のボタンから収集を開始してください。
            </p>
          ) : jobs.map(job => {
            const pct = Math.min(100, Math.round(job.collectedCount / job.targetCount * 100));
            return (
              <div key={job.id} className="flex items-center gap-4 px-5 py-4">
                {/* ステータスアイコン */}
                {job.status === "completed" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                 : job.status === "failed"   ? <XCircle     className="h-5 w-5 shrink-0 text-red-500" />
                 : job.status === "running"  ? <Loader2     className="h-5 w-5 shrink-0 text-blue-500 animate-spin" />
                 :                             <Clock       className="h-5 w-5 shrink-0 text-muted-foreground" />}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">
                      {job.industry?.name ?? "不明な業界"}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(job.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full",
                          job.status === "completed" ? "bg-green-500"
                          : job.status === "failed" ? "bg-red-400"
                          : "bg-blue-500"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {job.collectedCount}/{job.targetCount}件
                    </span>
                  </div>
                </div>

                {job.status === "completed" && (
                  <div className="flex items-center gap-2 ml-2">
                    <button
                      onClick={() => router.push(`/trends/${job.id}/metrics`)}
                      className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                    >
                      <BarChart3 className="inline h-3.5 w-3.5 mr-1" />
                      分析
                    </button>
                    <button
                      onClick={() => router.push(`/trends/${job.id}`)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                    >
                      生成
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
