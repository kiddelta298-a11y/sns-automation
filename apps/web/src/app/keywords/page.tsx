"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getKeywordSets, createKeywordSet, updateKeywordSet, deleteKeywordSet,
  startKeywordCollection, getKeywordSetJobs, getKeywordSetJob,
  analyzeJob, generateDrafts, getDrafts, postDraft,
  getAccounts,
  type ApiKeywordSet, type ApiCollectionJob, type ApiWinningPattern,
  type ApiGeneratedDraft, type ApiAccount,
} from "@/lib/api";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Search, PlusCircle, Trash2, PencilLine, X, Check, Play,
  Loader2, CheckCircle2, XCircle, Clock, BarChart3, ChevronRight,
  Sparkles, AlertCircle, Hash,
} from "lucide-react";

// ── 型 ──────────────────────────────────────────────────────────────────
type Step = "list" | "detail" | "collect" | "analyze" | "generate";

// ── キーワード入力フィールド ─────────────────────────────────────────────
function KeywordInput({
  keywords, onChange,
}: {
  keywords: string[];
  onChange: (kws: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed || keywords.includes(trimmed)) { setInput(""); return; }
    onChange([...keywords, trimmed]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[36px]">
        {keywords.map((kw) => (
          <span key={kw} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            <Hash className="h-3 w-3" />{kw}
            <button type="button" onClick={() => onChange(keywords.filter(k => k !== kw))}>
              <X className="h-3 w-3 ml-0.5 opacity-60 hover:opacity-100" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="キーワードを入力してEnter"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <Button type="button" size="sm" variant="outline" onClick={add}>追加</Button>
      </div>
    </div>
  );
}

// ── キーワードセット作成フォーム ─────────────────────────────────────────
function CreateForm({ onCreated }: { onCreated: (ks: ApiKeywordSet) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [minMatch, setMinMatch] = useState(1);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (keywords.length === 0) { setError("キーワードを1つ以上入力してください"); return; }
    setSubmitting(true); setError(null);
    try {
      const ks = await createKeywordSet({ name, keywords, minKeywordMatch: minMatch, description: description || undefined });
      setOpen(false);
      setName(""); setKeywords([]); setMinMatch(1); setDescription("");
      onCreated(ks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusCircle className="h-4 w-4" /> キーワードセットを追加
      </Button>
    );
  }

  return (
    <Card className="max-w-xl">
      <CardHeader className="pb-2"><CardTitle className="text-base">新しいキーワードセットを追加</CardTitle></CardHeader>
      <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6">
        {error && <p className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
        <div>
          <label className="mb-1 block text-sm font-medium">セット名</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
            placeholder="例：副業 × 時間術"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">キーワード</label>
          <KeywordInput keywords={keywords} onChange={setKeywords} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            最低キーワード混在数
            <span className="ml-1 text-xs text-muted-foreground">（投稿が含む必要があるキーワード数）</span>
          </label>
          <div className="flex items-center gap-3">
            <select value={minMatch} onChange={(e) => setMinMatch(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none">
              {[1,2,3,4,5].map(n => (
                <option key={n} value={n}>
                  {n === 1 ? `${n}個以上（いずれか1つ含めば取得）` : `${n}個以上（${n}つ以上混ざった投稿のみ）`}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            例：「副業」「時間」「月収」を登録 → 2以上にすると「副業 + 時間」が同時に出てくる投稿のみ抽出
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">メモ（任意）</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="このセットの目的・用途"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={submitting} size="sm">作成</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>キャンセル</Button>
        </div>
      </form>
    </Card>
  );
}

// ── 収集・分析・生成パネル ───────────────────────────────────────────────
function CollectPanel({
  ks,
  onBack,
}: {
  ks: ApiKeywordSet;
  onBack: () => void;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ApiCollectionJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ApiCollectionJob | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [targetCount, setTargetCount] = useState(200);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingSeed, setGeneratingSeed] = useState("");
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState<ApiGeneratedDraft[]>([]);
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [postingDraftId, setPostingDraftId] = useState<string | null>(null);
  const [postAccountId, setPostAccountId] = useState("");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const loadJobs = useCallback(async () => {
    const list = await getKeywordSetJobs(ks.id).catch(() => []);
    setJobs(list);
    const running = list.find(j => j.status === "running" || j.status === "pending");
    if (running && !activeJobId) setActiveJobId(running.id);
  }, [ks.id, activeJobId]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);
  useEffect(() => {
    getAccounts().then(list => {
      const threadsAccs = list.filter(a => a.platform === "threads");
      setAccounts(threadsAccs);
      if (threadsAccs.length > 0) setPostAccountId(threadsAccs[0].id);
    }).catch(() => {});
  }, []);

  // ポーリング
  useEffect(() => {
    if (!activeJobId) { setActiveJob(null); return; }
    const poll = async () => {
      const j = await getKeywordSetJob(activeJobId).catch(() => null);
      if (!j) return;
      setActiveJob(j);
      if (j.status === "completed" || j.status === "failed") {
        setActiveJobId(null);
        void loadJobs();
        if (j.status === "completed") {
          const d = await getDrafts(activeJobId).catch(() => []);
          setDrafts(d);
        }
      }
    };
    void poll();
    pollingRef.current = setInterval(poll, 2000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [activeJobId, loadJobs]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const { jobId } = await startKeywordCollection(ks.id, targetCount);
      setActiveJobId(jobId);
      await loadJobs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "収集開始に失敗しました");
    } finally {
      setCollecting(false);
    }
  };

  const handleAnalyze = async (jobId: string) => {
    setAnalyzing(true);
    try {
      await analyzeJob(jobId);
      const updatedJob = await getKeywordSetJob(jobId);
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, hasAnalysis: true, patternId: updatedJob.patternId } : j));
    } catch (err) {
      alert(err instanceof Error ? err.message : "分析に失敗しました");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerate = async (jobId: string) => {
    setGenerating(true);
    try {
      const job = jobs.find(j => j.id === jobId);
      const patternId = job?.patternId;
      if (!patternId) { alert("先に分析してください"); return; }
      const result = await generateDrafts(jobId, generatingSeed || undefined, 3);
      setDrafts(result.drafts);
    } catch (err) {
      alert(err instanceof Error ? err.message : "生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

  const handlePost = async (draft: ApiGeneratedDraft) => {
    if (!postAccountId) { alert("投稿するアカウントを選択してください"); return; }
    setPostingDraftId(draft.id);
    try {
      const { postId } = await postDraft(draft.id, postAccountId);
      router.push(`/posts/${postId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "投稿に失敗しました");
      setPostingDraftId(null);
    }
  };

  const isRunning = activeJob?.status === "running" || activeJob?.status === "pending";
  const progress = activeJob ? Math.min(100, Math.round(activeJob.collectedCount / activeJob.targetCount * 100)) : 0;

  const completedJobs = jobs.filter(j => j.status === "completed");
  const latestJob = completedJobs[0];

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">← 一覧に戻る</button>
        <span className="text-muted-foreground">/</span>
        <div>
          <h2 className="text-lg font-bold text-foreground">{ks.name}</h2>
          <div className="flex flex-wrap gap-1 mt-1">
            {ks.keywords.map(kw => (
              <span key={kw} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">#{kw}</span>
            ))}
            {ks.minKeywordMatch > 1 && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 font-medium">
                {ks.minKeywordMatch}個以上の混在必須
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Step 1: 収集 ── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Step 1 — Threadsから収集
        </h3>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">目標収集件数</label>
              <select value={targetCount} onChange={(e) => setTargetCount(Number(e.target.value))} disabled={isRunning}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none">
                {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n}件</option>)}
              </select>
            </div>
            <div className="pt-5">
              <button onClick={handleCollect} disabled={collecting || isRunning}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-all",
                  collecting || isRunning
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}>
                {collecting || isRunning ? <><Loader2 className="h-4 w-4 animate-spin" /> 収集中...</> : <><Play className="h-4 w-4" /> 収集開始</>}
              </button>
            </div>
          </div>

          {/* 進捗 */}
          {activeJob && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {activeJob.status === "completed" ? "収集完了！"
                   : activeJob.status === "failed" ? "収集失敗"
                   : "収集中..."}
                </span>
                <span className="text-sm font-bold text-primary">{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full transition-all",
                  activeJob.status === "completed" ? "bg-green-500"
                  : activeJob.status === "failed" ? "bg-red-500" : "bg-primary"
                )} style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                {activeJob.collectedCount}件 / {activeJob.targetCount}件収集済み
                {ks.minKeywordMatch > 1 && ` （${ks.minKeywordMatch}語以上混在フィルター適用中）`}
              </p>
              {activeJob.status === "failed" && activeJob.errorMessage && (
                <p className="text-xs text-destructive">{activeJob.errorMessage}</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Step 2: 分析 ── */}
      {completedJobs.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Step 2 — バズパターンを分析
          </h3>
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            {completedJobs.map(job => (
              <div key={job.id} className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {job.collectedCount}件収集済み
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(job.createdAt).toLocaleString("ja-JP")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {job.hasAnalysis ? (
                    <>
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> 分析済み
                      </span>
                      <button onClick={() => router.push(`/trends/${job.id}/metrics`)}
                        className="flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
                        <BarChart3 className="h-3.5 w-3.5" /> 詳細分析
                      </button>
                    </>
                  ) : (
                    <button onClick={() => handleAnalyze(job.id)} disabled={analyzing}
                      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      {analyzing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 分析中...</> : <><Sparkles className="h-3.5 w-3.5" /> AI分析を実行</>}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Step 3: 投稿文生成 ── */}
      {completedJobs.some(j => j.hasAnalysis) && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Step 3 — 投稿文を生成
          </h3>
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            {latestJob?.hasAnalysis && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">種（伝えたいこと・任意）</label>
                  <input type="text" value={generatingSeed} onChange={(e) => setGeneratingSeed(e.target.value)}
                    placeholder="例：副業初心者が最初に躓くポイント"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
                <button onClick={() => handleGenerate(latestJob.id)} disabled={generating}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> 生成中...</> : <><Sparkles className="h-4 w-4" /> 投稿文を3件生成</>}
                </button>
              </div>
            )}

            {/* 生成済み下書き */}
            {drafts.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-foreground">生成された投稿文</p>
                  {accounts.length > 0 && (
                    <select value={postAccountId} onChange={(e) => setPostAccountId(e.target.value)}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none">
                      {accounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}
                    </select>
                  )}
                </div>
                {drafts.map((draft, i) => (
                  <div key={draft.id} className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <Badge variant="secondary" className="shrink-0">{draft.postFormat ?? "other"}</Badge>
                      <button
                        onClick={() => handlePost(draft)}
                        disabled={postingDraftId === draft.id || accounts.length === 0}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0">
                        {postingDraftId === draft.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
                        予約投稿
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{draft.contentText}</p>
                    {draft.rationale && (
                      <p className="text-xs text-muted-foreground border-t border-border pt-2">{draft.rationale}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 収集履歴 */}
      {jobs.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">収集履歴</h3>
          <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {jobs.map(job => (
              <div key={job.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                {job.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                : job.status === "failed" ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                : job.status === "running" ? <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
                : <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
                <span className="flex-1 text-muted-foreground">{job.collectedCount}/{job.targetCount}件</span>
                <span className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleString("ja-JP")}</span>
                {job.status === "completed" && (
                  <button onClick={() => router.push(`/trends/${job.id}/metrics`)}
                    className="text-xs text-primary hover:underline">分析詳細</button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── メインページ ─────────────────────────────────────────────────────────
export default function KeywordsPage() {
  const [keywordSets, setKeywordSets] = useState<ApiKeywordSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ApiKeywordSet | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setKeywordSets(await getKeywordSets()); }
    catch { setKeywordSets([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (selected) {
    return (
      <div>
        <CollectPanel ks={selected} onBack={() => { setSelected(null); void load(); }} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" />
            カスタムキーワード収集
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            キーワードを指定してThreadsから投稿を収集・分析・生成します
          </p>
        </div>
      </div>

      <div className="mt-6">
        <CreateForm onCreated={(ks) => { setKeywordSets(prev => [ks, ...prev]); }} />
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : keywordSets.length === 0 ? (
          <Card className="py-16 text-center">
            <Search className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">キーワードセットがありません</p>
            <p className="mt-1 text-xs text-muted-foreground">
              上のボタンから追加してください。
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {keywordSets.map((ks) => (
              <div key={ks.id}
                className="group relative rounded-xl border border-border bg-card p-5 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => setSelected(ks)}>
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-foreground group-hover:text-primary">{ks.name}</h3>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (!confirm(`「${ks.name}」を削除しますか？`)) return; deleteKeywordSet(ks.id).then(load); }}
                    className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-destructive/10 text-destructive transition-opacity">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {ks.keywords.slice(0, 6).map(kw => (
                    <span key={kw} className="rounded-full bg-primary/8 px-2 py-0.5 text-xs text-primary/80">#{kw}</span>
                  ))}
                  {ks.keywords.length > 6 && (
                    <span className="text-xs text-muted-foreground">+{ks.keywords.length - 6}</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {ks.minKeywordMatch > 1 ? (
                    <span className="text-amber-600 font-medium">{ks.minKeywordMatch}語混在必須</span>
                  ) : <span>いずれか1語</span>}
                  <span className="flex items-center gap-1 text-primary group-hover:underline">
                    収集・分析する <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
