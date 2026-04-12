"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getCollectionJob,
  getTrendRanking,
  analyzeJob,
  getWinningPattern,
  generateDrafts,
  getDrafts,
  updateDraft,
  postDraft,
  getAccounts,
  type ApiCollectionJob,
  type ApiTrendPost,
  type ApiWinningPattern,
  type ApiGeneratedDraft,
  type ApiAccount,
} from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import {
  BarChart3,
  Sparkles,
  Send,
  Loader2,
  TrendingUp,
  ArrowLeft,
  MessageSquare,
  Heart,
  Repeat2,
  Eye,
  ChevronDown,
  CheckCircle2,
  Edit3,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const METRICS = [
  { value: "buzz_score",      label: "バズスコア" },
  { value: "engagement_rate", label: "エンゲージ率" },
  { value: "like_count",      label: "いいね数" },
  { value: "repost_count",    label: "リポスト数" },
  { value: "view_count",      label: "ビュー数" },
  { value: "hidden_gem",      label: "隠れバズ" },
];

const FORMAT_LABELS: Record<string, string> = {
  question:  "問いかけ型",
  list:      "リスト型",
  story:     "体験談型",
  opinion:   "主張型",
  punchline: "オチ型",
  other:     "その他",
};

export default function TrendJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();

  const [job, setJob] = useState<ApiCollectionJob | null>(null);
  const [posts, setPosts] = useState<ApiTrendPost[]>([]);
  const [formatDist, setFormatDist] = useState<{ format: string | null; count: number; avgBuzz: number }[]>([]);
  const [pattern, setPattern] = useState<ApiWinningPattern | null>(null);
  const [drafts, setDrafts] = useState<ApiGeneratedDraft[]>([]);
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);

  const [metric, setMetric] = useState("buzz_score");
  const [activeTab, setActiveTab] = useState<"ranking" | "analysis" | "generate">("ranking");

  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [seed, setSeed] = useState("");
  const [genCount, setGenCount] = useState(3);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [postingDraftId, setPostingDraftId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [displayCount, setDisplayCount] = useState(30);

  useEffect(() => {
    (async () => {
      const [j, accs] = await Promise.all([
        getCollectionJob(jobId),
        getAccounts().catch(() => []),
      ]);
      setJob(j);
      if (accs.length > 0) setSelectedAccountId(accs[0].id);
      setAccounts(accs);

      if (j.hasAnalysis) {
        const p = await getWinningPattern(jobId).catch(() => null);
        setPattern(p);
        if (p) {
          const d = await getDrafts(jobId).catch(() => []);
          setDrafts(d);
        }
      }
    })();
  }, [jobId]);

  useEffect(() => {
    getTrendRanking({ industryId: job?.industryId ?? "", jobId, metric, limit: 2000 })
      .then(res => {
        setPosts(res.posts);
        setFormatDist(res.formatDistribution);
        setDisplayCount(30);
      })
      .catch(() => {});
  }, [job?.industryId, jobId, metric]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await analyzeJob(jobId);
      const p = await getWinningPattern(jobId);
      setPattern(p);
      setActiveTab("analysis");
    } catch (err) {
      alert(err instanceof Error ? err.message : "分析に失敗しました");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await generateDrafts(jobId, seed || undefined, genCount);
      setDrafts(prev => [...res.drafts, ...prev]);
      setActiveTab("generate");
    } catch (err) {
      alert(err instanceof Error ? err.message : "生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveDraft = async (id: string) => {
    await updateDraft(id, { contentText: editingText });
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, contentText: editingText } : d));
    setEditingDraftId(null);
  };

  const handlePostDraft = async (id: string) => {
    if (!selectedAccountId) { alert("アカウントを選択してください"); return; }
    setPostingDraftId(id);
    try {
      await postDraft(id, selectedAccountId);
      setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: "posted" } : d));
    } catch (err) {
      alert(err instanceof Error ? err.message : "投稿に失敗しました");
    } finally {
      setPostingDraftId(null);
    }
  };

  const report = pattern?.analysisReport;

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/trends" className="rounded-lg p-1.5 hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {job?.industry?.name ?? "読み込み中..."} — 分析・生成
          </h1>
          <p className="text-sm text-muted-foreground">
            {job?.collectedCount ?? 0}件の投稿を分析
          </p>
        </div>
      </div>

      {/* アクションバー */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button
          onClick={handleAnalyze}
          disabled={analyzing || !!pattern}
          variant={pattern ? "outline" : "default"}
          className="gap-2"
        >
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
          {pattern ? "分析済み" : analyzing ? "分析中..." : "勝ちパターンを分析"}
        </Button>
        {pattern && (
          <Button onClick={handleGenerate} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "生成中..." : "投稿文案を生成"}
          </Button>
        )}
      </div>

      {/* タブ */}
      <div className="mb-6 flex gap-1 border-b border-border">
        {[
          { key: "ranking",  label: "ランキング",   icon: TrendingUp },
          { key: "analysis", label: "勝ちパターン", icon: BarChart3 },
          { key: "generate", label: "投稿文案",      icon: Sparkles },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.key === "generate" && drafts.length > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground leading-none">
                {drafts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ========== ランキング ========== */}
      {activeTab === "ranking" && (
        <div className="space-y-4">
          {/* 指標切替 */}
          <div className="flex flex-wrap gap-2">
            {METRICS.map(m => (
              <button
                key={m.value}
                onClick={() => setMetric(m.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  metric === m.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-border",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* フォーマット分布 */}
          {formatDist.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">フォーマット分布</CardTitle></CardHeader>
              <div className="flex flex-wrap gap-3 px-6 pb-4">
                {formatDist.map(d => (
                  <div key={d.format ?? "other"} className="flex flex-col items-center gap-1">
                    <span className="text-lg font-bold text-foreground">{d.count}</span>
                    <span className="text-xs text-muted-foreground">{FORMAT_LABELS[d.format ?? "other"] ?? d.format}</span>
                    <span className="text-xs text-primary">avg {Number(d.avgBuzz).toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 投稿件数 */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              全 {posts.length} 件中 {Math.min(displayCount, posts.length)} 件表示
            </p>
          </div>

          {/* 投稿一覧 */}
          <div className="space-y-3">
            {posts.slice(0, displayCount).map((post, i) => {
              const postUrl = post.platformPostId
                ? `https://www.threads.com${post.platformPostId.startsWith("/") ? "" : "/"}${post.platformPostId}`
                : post.authorUsername
                  ? `https://www.threads.com/@${post.authorUsername}`
                  : null;
              return (
                <Card key={post.id} className="overflow-hidden">
                  <div className="flex gap-4 p-4">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
                          {FORMAT_LABELS[post.postFormat ?? "other"] ?? "その他"}
                        </span>
                        <span className="text-xs text-muted-foreground">{post.charCount}文字</span>
                        {post.authorUsername && (
                          <span className="text-xs text-muted-foreground">@{post.authorUsername}</span>
                        )}
                        {postUrl && (
                          <a
                            href={postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline ml-auto"
                          >
                            元投稿を開く ↗
                          </a>
                        )}
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                        {post.contentText}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Heart className="h-3.5 w-3.5" />
                          {formatNumber(post.likeCount)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Repeat2 className="h-3.5 w-3.5" />
                          {formatNumber(post.repostCount)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {formatNumber(post.replyCount)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" />
                          {formatNumber(post.viewCount)}
                        </span>
                        <span className="ml-auto font-medium text-primary">
                          バズスコア: {post.buzzScore.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
            {posts.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                投稿データがありません
              </p>
            )}
            {displayCount < posts.length && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={() => setDisplayCount(prev => Math.min(prev + 50, posts.length))}
                  className="gap-2"
                >
                  <ChevronDown className="h-4 w-4" />
                  さらに50件表示（残り {posts.length - displayCount} 件）
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== 勝ちパターン ========== */}
      {activeTab === "analysis" && (
        <div className="space-y-4">
          {!pattern && (
            <div className="py-16 text-center">
              <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">まだ分析が実行されていません</p>
              <Button onClick={handleAnalyze} disabled={analyzing} className="gap-2">
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                {analyzing ? "分析中..." : "分析を実行"}
              </Button>
            </div>
          )}

          {report && (
            <>
              {/* サマリー */}
              <Card>
                <CardHeader><CardTitle className="text-base">勝ちパターンサマリー</CardTitle></CardHeader>
                <p className="px-6 pb-6 text-sm text-foreground leading-relaxed">{report.summary}</p>
              </Card>

              {/* 重要インサイト */}
              {report.keyInsights && report.keyInsights.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">重要インサイト</CardTitle></CardHeader>
                  <ul className="px-6 pb-6 space-y-2">
                    {report.keyInsights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {insight}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* 勝ちフォーマット */}
              {report.winningFormats && report.winningFormats.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">勝ちフォーマット</CardTitle></CardHeader>
                  <div className="px-6 pb-6 space-y-3">
                    {report.winningFormats.map((fmt, i) => (
                      <div key={i} className="rounded-lg bg-muted p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground font-medium">
                            {FORMAT_LABELS[fmt.format] ?? fmt.format}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{fmt.reason}</p>
                        <p className="mt-1 text-xs font-medium text-foreground">例: {fmt.example}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* フックパターン */}
              {report.hookPatterns && report.hookPatterns.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">効果的な冒頭（フック）パターン</CardTitle></CardHeader>
                  <ul className="px-6 pb-6 space-y-2">
                    {report.hookPatterns.map((h, i) => (
                      <li key={i} className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">
                        {h}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* 最適文字数 */}
                {report.optimalLength && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">最適文字数</CardTitle></CardHeader>
                    <div className="px-6 pb-6">
                      <p className="text-2xl font-bold text-primary">
                        {report.optimalLength.min}〜{report.optimalLength.max}文字
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{report.optimalLength.reason}</p>
                    </div>
                  </Card>
                )}

                {/* 避けるべきパターン */}
                {report.avoidPatterns && report.avoidPatterns.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">避けるべきパターン</CardTitle></CardHeader>
                    <ul className="px-6 pb-6 space-y-1">
                      {report.avoidPatterns.map((a, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>

              {/* 投稿戦略 */}
              {report.postingAdvice && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">投稿戦略アドバイス</CardTitle></CardHeader>
                  <p className="px-6 pb-6 text-sm text-foreground leading-relaxed">{report.postingAdvice}</p>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ========== 投稿文案 ========== */}
      {activeTab === "generate" && (
        <div className="space-y-6">
          {/* 生成フォーム */}
          {pattern && (
            <Card>
              <CardHeader><CardTitle className="text-sm">投稿文案を生成</CardTitle></CardHeader>
              <div className="px-6 pb-6 space-y-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">
                    投稿の種（伝えたいこと）— 空欄でもOK
                  </label>
                  <textarea
                    value={seed}
                    onChange={e => setSeed(e.target.value)}
                    placeholder="例：副業で月5万稼いだ方法を伝えたい"
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="text-xs text-muted-foreground">生成件数</label>
                  <div className="flex gap-1.5">
                    {[3, 5, 10].map(n => (
                      <button
                        key={n}
                        onClick={() => setGenCount(n)}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                          genCount === n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-border",
                        )}
                      >
                        {n}件
                      </button>
                    ))}
                  </div>
                  <Button onClick={handleGenerate} disabled={generating} size="sm" className="ml-auto gap-1.5">
                    {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {generating ? "生成中..." : "生成"}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {!pattern && (
            <div className="py-12 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">先に「勝ちパターンを分析」を実行してください</p>
            </div>
          )}

          {/* アカウント選択 */}
          {drafts.length > 0 && accounts.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground whitespace-nowrap">投稿アカウント</label>
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>@{a.username} ({a.platform})</option>
                ))}
              </select>
            </div>
          )}

          {/* 文案カード一覧 */}
          <div className="space-y-4">
            {drafts.map(draft => (
              <Card key={draft.id} className={cn(draft.status === "posted" && "opacity-60")}>
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
                      {FORMAT_LABELS[draft.postFormat ?? "other"] ?? "その他"}
                    </span>
                    {draft.status === "posted" && (
                      <span className="flex items-center gap-1 text-xs text-green-500">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        投稿済み
                      </span>
                    )}
                  </div>

                  {editingDraftId === draft.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        rows={6}
                        className="w-full rounded-lg border border-primary bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => setEditingDraftId(null)}>
                          キャンセル
                        </Button>
                        <Button size="sm" onClick={() => handleSaveDraft(draft.id)}>
                          保存
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                      {draft.contentText}
                    </p>
                  )}

                  {draft.rationale && !editingDraftId && (
                    <p className="mt-3 text-xs text-muted-foreground italic">
                      採用理由: {draft.rationale}
                    </p>
                  )}

                  {draft.status !== "posted" && !editingDraftId && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => { setEditingDraftId(draft.id); setEditingText(draft.contentText); }}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        編集
                      </button>
                      <button
                        onClick={() => handlePostDraft(draft.id)}
                        disabled={postingDraftId === draft.id || !selectedAccountId}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {postingDraftId === draft.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Send className="h-3.5 w-3.5" />
                        }
                        {postingDraftId === draft.id ? "投稿中..." : "今すぐ投稿"}
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
