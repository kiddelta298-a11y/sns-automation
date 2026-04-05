"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getKeywordSets, createKeywordSet, deleteKeywordSet,
  startKeywordCollection, getKeywordSetJob,
  analyzeJob, generateDrafts, postDraft,
  getAccounts,
  type ApiKeywordSet, type ApiCollectionJob,
  type ApiGeneratedDraft, type ApiAccount,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Hash, X, Play, Loader2, CheckCircle2, XCircle,
  Sparkles, Send, Trash2, ChevronDown, ChevronUp,
  BookmarkPlus, RotateCcw,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────────────────────
type Phase = "idle" | "collecting" | "analyzing" | "generating" | "done" | "error";

// ─────────────────────────────────────────────────────────────────────────────
// キーワードタグ入力
// ─────────────────────────────────────────────────────────────────────────────
function KeywordInput({ keywords, onChange, disabled }: {
  keywords: string[];
  onChange: (kws: string[]) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const v = input.trim();
    if (!v || keywords.includes(v)) { setInput(""); return; }
    onChange([...keywords, v]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="min-h-[40px] flex flex-wrap gap-1.5">
        {keywords.map((kw) => (
          <span key={kw} className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <Hash className="h-3.5 w-3.5" />{kw}
            {!disabled && (
              <button type="button" onClick={() => onChange(keywords.filter(k => k !== kw))}>
                <X className="h-3 w-3 ml-0.5 opacity-60 hover:opacity-100" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder={keywords.length === 0 ? "キーワードを入力して Enter" : "追加..."}
            className="flex-1 min-w-[160px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none py-1"
          />
        )}
      </div>
      {!disabled && keywords.length === 0 && (
        <p className="text-xs text-muted-foreground">例：副業、時間術、月収 など — Enterで追加</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ステップ進捗インジケーター
// ─────────────────────────────────────────────────────────────────────────────
function StepIndicator({ phase, job }: { phase: Phase; job: ApiCollectionJob | null }) {
  const steps = [
    { key: "collecting", label: "Threadsから収集", detail: job ? `${job.collectedCount} / ${job.targetCount}件` : "" },
    { key: "analyzing",  label: "バズパターンをAI分析" },
    { key: "generating", label: "投稿文を自動生成" },
  ] as const;

  const phaseIndex = phase === "collecting" ? 0 : phase === "analyzing" ? 1 : phase === "generating" ? 2 : phase === "done" ? 3 : -1;
  const progress = job ? Math.min(100, Math.round(job.collectedCount / job.targetCount * 100)) : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {steps.map((step, i) => {
        const isDone = phaseIndex > i || phase === "done";
        const isActive = phaseIndex === i;
        const isPending = phaseIndex < i && phase !== "done";
        return (
          <div key={step.key}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors",
                isDone ? "bg-green-500 text-white"
                : isActive ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
              )}>
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : isActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i + 1}
              </div>
              <div className="flex-1">
                <p className={cn("text-sm font-medium", isPending ? "text-muted-foreground" : "text-foreground")}>
                  {step.label}
                </p>
                {isActive && step.key === "collecting" && job && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                )}
              </div>
              {isActive && step.key !== "collecting" && (
                <span className="text-xs text-muted-foreground animate-pulse">処理中...</span>
              )}
            </div>
            {/* 収集プログレスバー */}
            {isActive && step.key === "collecting" && (
              <div className="mt-2 ml-10">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 下書きカード
// ─────────────────────────────────────────────────────────────────────────────
function DraftCard({ draft, checked, onCheck, onPost, posting }: {
  draft: ApiGeneratedDraft;
  checked: boolean;
  onCheck: (v: boolean) => void;
  onPost: () => void;
  posting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 space-y-3 transition-colors",
      checked ? "border-primary/50 bg-primary/5" : "border-border",
    )}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)}
          className="mt-1 h-4 w-4 rounded accent-primary cursor-pointer shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary" className="text-xs">{draft.postFormat ?? "other"}</Badge>
          </div>
          <p className={cn(
            "text-sm leading-relaxed text-foreground whitespace-pre-wrap",
            !expanded && "line-clamp-3",
          )}>
            {draft.contentText}
          </p>
          {draft.contentText.length > 100 && (
            <button onClick={() => setExpanded(!expanded)}
              className="mt-1 flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
              {expanded ? <><ChevronUp className="h-3 w-3" />閉じる</> : <><ChevronDown className="h-3 w-3" />続きを見る</>}
            </button>
          )}
        </div>
        <button onClick={onPost} disabled={posting}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0">
          {posting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          投稿
        </button>
      </div>
      {draft.rationale && (
        <p className="ml-7 text-xs text-muted-foreground border-t border-border pt-2">{draft.rationale}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// メインページ
// ─────────────────────────────────────────────────────────────────────────────
export default function KeywordsPage() {
  const router = useRouter();

  // ── 入力フォーム状態 ──
  const [keywords, setKeywords] = useState<string[]>([]);
  const [targetCount, setTargetCount] = useState(200);
  const [minMatch, setMinMatch] = useState(1);
  const [draftCount, setDraftCount] = useState(3);
  const [seed, setSeed] = useState("");

  // ── 実行状態 ──
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<ApiCollectionJob | null>(null);

  // ── 結果 ──
  const [drafts, setDrafts] = useState<ApiGeneratedDraft[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // ── 投稿アカウント ──
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [postAccountId, setPostAccountId] = useState("");
  const [postingId, setPostingId] = useState<string | null>(null);
  const [bulkPosting, setBulkPosting] = useState(false);

  // ── 保存済みキーワードセット ──
  const [savedSets, setSavedSets] = useState<ApiKeywordSet[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // アカウント & 保存済みセット読み込み
  useEffect(() => {
    getAccounts().then(list => {
      const th = list.filter(a => a.platform === "threads" && a.status === "active");
      setAccounts(th);
      if (th.length > 0) setPostAccountId(th[0].id);
    }).catch(() => {});
    getKeywordSets().then(setSavedSets).catch(() => {});
  }, []);

  // ポーリング停止ヘルパー
  const stopPolling = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  };

  // ─────────────────────────────────────────────────
  // メインパイプライン
  // ─────────────────────────────────────────────────
  const runPipeline = useCallback(async (kws: string[], target: number, min: number, count: number, seedText: string) => {
    if (kws.length === 0) return;
    setPhase("collecting");
    setErrorMsg(null);
    setDrafts([]);
    setCheckedIds(new Set());
    setCurrentJob(null);
    stopPolling();

    try {
      // ① キーワードセットを作成（名前は自動生成）
      const name = kws.slice(0, 3).join(" × ") + (kws.length > 3 ? " ..." : "");
      const ks = await createKeywordSet({ name, keywords: kws, minKeywordMatch: min });
      setSavedSets(prev => [ks, ...prev]);

      // ② 収集開始
      const { jobId } = await startKeywordCollection(ks.id, target);

      // ③ 収集完了をポーリング待機
      const job = await new Promise<ApiCollectionJob>((resolve, reject) => {
        const check = async () => {
          try {
            const j = await getKeywordSetJob(jobId);
            setCurrentJob(j);
            if (j.status === "completed") { stopPolling(); resolve(j); }
            else if (j.status === "failed") { stopPolling(); reject(new Error(j.errorMessage ?? "収集に失敗しました")); }
          } catch (e) { stopPolling(); reject(e); }
        };
        void check();
        pollingRef.current = setInterval(check, 2000);
      });

      if (job.collectedCount === 0) throw new Error("投稿が1件も収集できませんでした。キーワードを変えて試してください。");

      // ④ AI分析
      setPhase("analyzing");
      await analyzeJob(jobId);

      // ⑤ 投稿文生成
      setPhase("generating");
      const result = await generateDrafts(jobId, seedText || undefined, count);

      // ⑥ 完了
      setDrafts(result.drafts);
      setCheckedIds(new Set(result.drafts.map(d => d.id)));
      setPhase("done");

    } catch (err) {
      stopPolling();
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
      setPhase("error");
    }
  }, []);

  // クリーンアップ
  useEffect(() => () => stopPolling(), []);

  // ── 個別投稿 ──
  const handlePost = async (draft: ApiGeneratedDraft) => {
    if (!postAccountId) { alert("アカウントを選択してください"); return; }
    setPostingId(draft.id);
    try {
      const { postId } = await postDraft(draft.id, postAccountId);
      router.push(`/posts/${postId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "投稿に失敗しました");
    } finally {
      setPostingId(null);
    }
  };

  // ── 一括投稿 ──
  const handleBulkPost = async () => {
    if (!postAccountId) { alert("アカウントを選択してください"); return; }
    const targets = drafts.filter(d => checkedIds.has(d.id));
    if (targets.length === 0) { alert("投稿する下書きを選択してください"); return; }
    if (!confirm(`${targets.length}件を @${accounts.find(a=>a.id===postAccountId)?.username} に投稿しますか？`)) return;
    setBulkPosting(true);
    try {
      for (const draft of targets) {
        await postDraft(draft.id, postAccountId);
      }
      router.push("/posts");
    } catch (err) {
      alert(err instanceof Error ? err.message : "投稿に失敗しました");
    } finally {
      setBulkPosting(false);
    }
  };

  const isRunning = phase === "collecting" || phase === "analyzing" || phase === "generating";
  const allChecked = drafts.length > 0 && drafts.every(d => checkedIds.has(d.id));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ── ヘッダー ── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">キーワード収集・投稿</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          キーワードを入力して実行すると、収集→分析→投稿文生成まで自動で行います
        </p>
      </div>

      {/* ── 入力パネル ── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        {/* キーワード */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">キーワード</label>
          <div className="rounded-lg border border-border bg-background px-3 py-2.5">
            <KeywordInput keywords={keywords} onChange={setKeywords} disabled={isRunning} />
          </div>
        </div>

        {/* 設定行 */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">収集件数</label>
            <select value={targetCount} onChange={(e) => setTargetCount(Number(e.target.value))} disabled={isRunning}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm focus:border-primary focus:outline-none">
              {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n}件</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">最低混在数</label>
            <select value={minMatch} onChange={(e) => setMinMatch(Number(e.target.value))} disabled={isRunning}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm focus:border-primary focus:outline-none">
              {[1,2,3,4,5].map(n => (
                <option key={n} value={n}>{n === 1 ? "1語（いずれか）" : `${n}語以上同時`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">生成する投稿数</label>
            <select value={draftCount} onChange={(e) => setDraftCount(Number(e.target.value))} disabled={isRunning}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm focus:border-primary focus:outline-none">
              {[1,2,3,5,8,10].map(n => <option key={n} value={n}>{n}件</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">投稿するアカウント</label>
            {accounts.length > 0 ? (
              <select value={postAccountId} onChange={(e) => setPostAccountId(e.target.value)} disabled={isRunning}
                className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm focus:border-primary focus:outline-none">
                {accounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground pt-2">アカウント未設定</p>
            )}
          </div>
        </div>

        {/* 伝えたいこと（任意） */}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            伝えたいこと <span className="opacity-60">（任意：投稿のテーマ・軸）</span>
          </label>
          <input type="text" value={seed} onChange={(e) => setSeed(e.target.value)} disabled={isRunning}
            placeholder="例：副業初心者が最初に躓くポイント"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50" />
        </div>

        {/* 実行ボタン */}
        <button
          onClick={() => runPipeline(keywords, targetCount, minMatch, draftCount, seed)}
          disabled={isRunning || keywords.length === 0}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-xl py-3 text-base font-bold transition-all",
            isRunning || keywords.length === 0
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md",
          )}
        >
          {isRunning
            ? <><Loader2 className="h-5 w-5 animate-spin" /> 実行中...</>
            : <><Play className="h-5 w-5" /> 情報収集を実行</>
          }
        </button>

        {/* 保存済みキーワードクイック選択 */}
        {savedSets.length > 0 && (
          <div>
            <button onClick={() => setShowSaved(!showSaved)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <BookmarkPlus className="h-3.5 w-3.5" />
              保存済みキーワードから選ぶ
              {showSaved ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showSaved && (
              <div className="mt-2 flex flex-wrap gap-2">
                {savedSets.slice(0, 10).map(ks => (
                  <div key={ks.id} className="flex items-center gap-1">
                    <button
                      onClick={() => { setKeywords(ks.keywords); setMinMatch(ks.minKeywordMatch); setShowSaved(false); }}
                      disabled={isRunning}
                      className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs hover:border-primary hover:text-primary transition-colors">
                      {ks.name}
                    </button>
                    <button onClick={() => deleteKeywordSet(ks.id).then(() => setSavedSets(p => p.filter(s => s.id !== ks.id)))}
                      className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 進捗 ── */}
      {(isRunning || phase === "error") && (
        <div className="space-y-3">
          {phase === "error" ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">エラーが発生しました</p>
                <p className="text-xs text-destructive/80 mt-1">{errorMsg}</p>
                <button onClick={() => setPhase("idle")}
                  className="mt-2 flex items-center gap-1 text-xs text-destructive underline hover:no-underline">
                  <RotateCcw className="h-3 w-3" /> 再試行する
                </button>
              </div>
            </div>
          ) : (
            <StepIndicator phase={phase} job={currentJob} />
          )}
        </div>
      )}

      {/* ── 生成結果 ── */}
      {phase === "done" && drafts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-bold text-foreground">
              生成された投稿文 <span className="text-muted-foreground font-normal text-sm">（{drafts.length}件）</span>
            </h2>
            <div className="flex items-center gap-2">
              {/* 再生成ボタン */}
              <button
                onClick={() => runPipeline(keywords, targetCount, minMatch, draftCount, seed)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                <RotateCcw className="h-3.5 w-3.5" /> 再実行
              </button>
            </div>
          </div>

          {/* 一括操作バー */}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allChecked}
                onChange={(e) => setCheckedIds(e.target.checked ? new Set(drafts.map(d => d.id)) : new Set())}
                className="h-4 w-4 rounded accent-primary" />
              <span className="text-sm font-medium text-foreground">全選択</span>
            </label>
            <span className="text-xs text-muted-foreground">{checkedIds.size}件選択中</span>
            <div className="ml-auto flex items-center gap-2">
              {accounts.length > 0 && (
                <select value={postAccountId} onChange={(e) => setPostAccountId(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none">
                  {accounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}
                </select>
              )}
              <button
                onClick={handleBulkPost}
                disabled={bulkPosting || checkedIds.size === 0 || accounts.length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {bulkPosting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                一括投稿 {checkedIds.size > 0 && `（${checkedIds.size}件）`}
              </button>
            </div>
          </div>

          {/* 下書きカード一覧 */}
          <div className="space-y-3">
            {drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                checked={checkedIds.has(draft.id)}
                onCheck={(v) => setCheckedIds(prev => {
                  const next = new Set(prev);
                  v ? next.add(draft.id) : next.delete(draft.id);
                  return next;
                })}
                onPost={() => handlePost(draft)}
                posting={postingId === draft.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
