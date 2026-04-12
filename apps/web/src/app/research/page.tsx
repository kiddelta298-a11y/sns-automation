"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getAdultGenres,
  createAdultGenre,
  deleteAdultGenre,
  getAccountsWithProfile,
  addReferenceAccount,
  deleteReferenceAccount,
  analyzeGenre,
  getGenreProfile,
  getMonitoredPosts,
  triggerMonitor,
  type ApiAdultGenre,
  type ApiReferenceAccount,
  type ApiGenreProfile,
  type ApiMonitoredPost,
} from "@/lib/api";
import {
  FlaskConical, Plus, Trash2, Play, ChevronDown, ChevronUp,
  Copy, Check, Loader2, X, RefreshCw, TrendingUp, Image,
  Calendar, Users, BarChart2, Zap, AlertTriangle, Tag,
  Activity, LineChart,
} from "lucide-react";
import Link from "next/link";

// ─── カラーヘルパー ────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: "rgba(234,179,8,0.15)",   text: "#fbbf24", label: "待機中" },
  running:   { bg: "rgba(59,130,246,0.15)",   text: "#60a5fa", label: "実行中" },
  completed: { bg: "rgba(34,197,94,0.15)",    text: "#4ade80", label: "完了" },
  failed:    { bg: "rgba(239,68,68,0.15)",    text: "#f87171", label: "失敗" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: c.bg, color: c.text }}
    >
      {status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
      {c.label}
    </span>
  );
}

function Tag_({ children, color = "purple" }: { children: React.ReactNode; color?: "purple" | "green" | "red" | "yellow" }) {
  const colors = {
    purple: { bg: "rgba(139,92,246,0.15)", text: "#c4b5fd", border: "rgba(139,92,246,0.2)" },
    green:  { bg: "rgba(34,197,94,0.12)",  text: "#4ade80", border: "rgba(34,197,94,0.2)" },
    red:    { bg: "rgba(239,68,68,0.12)",   text: "#f87171", border: "rgba(239,68,68,0.2)" },
    yellow: { bg: "rgba(234,179,8,0.12)",   text: "#fbbf24", border: "rgba(234,179,8,0.2)" },
  };
  const c = colors[color];
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {children}
    </span>
  );
}

// ─── アカウント年齢バッジ ──────────────────────────────────────
function AgeBadge({ months }: { months: number | null }) {
  if (months === null) return null;
  const label = months < 3 ? "新規" : months < 12 ? `${months}ヶ月` : `${Math.floor(months / 12)}年${months % 12 > 0 ? months % 12 + "ヶ月" : ""}`;
  const color = months <= 6 ? "green" : months <= 18 ? "yellow" : "purple";
  return <Tag_ color={color}>{label}</Tag_>;
}

// ─── セクションカード ──────────────────────────────────────────
function SectionCard({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "rgba(15,12,30,0.6)", border: "1px solid rgba(139,92,246,0.1)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4" style={{ color: "#a78bfa" }} />
        <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>{title}</p>
      </div>
      {children}
    </div>
  );
}

// ─── 参考アカウントカード ──────────────────────────────────────
function AccountChip({
  acc,
  onDelete,
}: {
  acc: ApiReferenceAccount;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl p-3"
      style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" style={{ color: "#c4b5fd" }}>@{acc.username}</span>
          <AgeBadge months={acc.accountAgeMonths} />
          {acc.accountCreatedAt && (
            <span className="text-xs" style={{ color: "rgba(240,238,255,0.35)" }}>
              <Calendar className="inline h-3 w-3 mr-0.5" />
              {acc.accountCreatedAt}
            </span>
          )}
        </div>
        <button
          onClick={onDelete}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors"
          style={{ color: "rgba(240,238,255,0.25)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(240,238,255,0.25)"; }}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {(acc.followersCount !== null || acc.postsCount !== null) && (
        <div className="flex gap-3 text-xs" style={{ color: "rgba(240,238,255,0.4)" }}>
          {acc.followersCount !== null && (
            <span>
              <Users className="inline h-3 w-3 mr-0.5" />
              {acc.followersCount.toLocaleString()}フォロワー
            </span>
          )}
          {acc.postsCount !== null && (
            <span>{acc.postsCount.toLocaleString()}投稿</span>
          )}
          {acc.lastProfileScrapedAt && (
            <span className="ml-auto">更新: {new Date(acc.lastProfileScrapedAt).toLocaleDateString("ja-JP")}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 監視投稿カード ────────────────────────────────────────────
function MonitoredPostCard({ post }: { post: ApiMonitoredPost }) {
  const buzzColor = post.buzzScore > 0.01 ? "#fbbf24" : post.buzzScore > 0.001 ? "#60a5fa" : "rgba(240,238,255,0.35)";
  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{ background: "rgba(15,12,30,0.5)", border: "1px solid rgba(139,92,246,0.1)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-relaxed flex-1" style={{ color: "rgba(240,238,255,0.75)" }}>
          {post.contentText.substring(0, 120)}{post.contentText.length > 120 ? "…" : ""}
        </p>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {post.hasImage && (
            <Tag_ color="purple"><Image className="h-3 w-3 mr-0.5 inline" />画像</Tag_>
          )}
          <span className="text-xs font-mono" style={{ color: buzzColor }}>
            ★{post.buzzScore.toFixed(4)}
          </span>
        </div>
      </div>
      <div className="flex gap-3 text-xs" style={{ color: "rgba(240,238,255,0.4)" }}>
        <span>❤ {post.likeCount.toLocaleString()}</span>
        <span>🔁 {post.repostCount.toLocaleString()}</span>
        <span>💬 {post.replyCount.toLocaleString()}</span>
        {post.lastSnapshotAt && (
          <span className="ml-auto">
            最終更新: {new Date(post.lastSnapshotAt).toLocaleDateString("ja-JP")}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── プロファイル表示 ─────────────────────────────────────────
function ProfileView({ profile }: { profile: ApiGenreProfile }) {
  const [copiedKeywords, setCopiedKeywords] = useState(false);
  const pj = profile.profileJson;
  if (!pj) return null;

  const copyKeywords = () => {
    if (pj.recommendedKeywords) {
      navigator.clipboard.writeText(pj.recommendedKeywords.join("\n"));
      setCopiedKeywords(true);
      setTimeout(() => setCopiedKeywords(false), 2000);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      {/* ジャンルサマリー */}
      {pj.genreSummary && (
        <div
          className="rounded-xl p-4"
          style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)" }}
        >
          <p className="text-xs font-semibold mb-1" style={{ color: "#a78bfa" }}>ジャンルサマリー</p>
          <p className="text-sm" style={{ color: "rgba(240,238,255,0.85)" }}>{pj.genreSummary}</p>
        </div>
      )}

      {/* ★新規アカウント戦略 */}
      {pj.accountAgeInsights && (
        <SectionCard title="新規アカウント戦略（再現性重視）" icon={Zap}>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "#fbbf24" }}>最優先戦略</p>
              <p className="text-xs" style={{ color: "rgba(240,238,255,0.75)" }}>{pj.accountAgeInsights.newAccountStrategy}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "#60a5fa" }}>開設初期のバズパターン</p>
              <p className="text-xs" style={{ color: "rgba(240,238,255,0.75)" }}>{pj.accountAgeInsights.earlyGrowthPattern}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "#4ade80" }}>0から再現できる方法</p>
              <p className="text-xs" style={{ color: "rgba(240,238,255,0.75)" }}>{pj.accountAgeInsights.reproducibility}</p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ★バズトリガー */}
      {pj.buzzTriggers && pj.buzzTriggers.length > 0 && (
        <SectionCard title="バズのトリガー" icon={TrendingUp}>
          <div className="space-y-3">
            {pj.buzzTriggers.map((bt, i) => (
              <div key={i} className="rounded-lg p-3" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}>
                <p className="text-xs font-semibold mb-1" style={{ color: "#fbbf24" }}>{bt.trigger}</p>
                <p className="text-xs mb-1.5" style={{ color: "rgba(240,238,255,0.55)" }}>{bt.mechanism}</p>
                <p className="text-xs italic rounded px-2 py-1" style={{ background: "rgba(0,0,0,0.3)", color: "rgba(240,238,255,0.75)" }}>
                  例: 「{bt.example}」
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ★画像分析 */}
      {pj.imageAnalysis && (
        <SectionCard title="画像分析" icon={Image}>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium mb-1.5" style={{ color: "#a78bfa" }}>効果が高い画像タイプ</p>
              <div className="flex flex-wrap gap-1.5">
                {pj.imageAnalysis.bestImageTypes.map((t, i) => <Tag_ key={i}>{t}</Tag_>)}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "#a78bfa" }}>バズる画像の特徴</p>
              <p className="text-xs" style={{ color: "rgba(240,238,255,0.75)" }}>{pj.imageAnalysis.imageCharacteristics}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "#a78bfa" }}>画像あり vs テキストのみ</p>
              <p className="text-xs" style={{ color: "rgba(240,238,255,0.75)" }}>{pj.imageAnalysis.imageVsNoImage}</p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ★画像×テキストの組み合わせ */}
      {pj.imageTextCombos && pj.imageTextCombos.length > 0 && (
        <SectionCard title="画像 × テキストの最強パターン" icon={BarChart2}>
          <div className="space-y-2">
            {pj.imageTextCombos.map((combo, i) => (
              <div key={i} className="rounded-lg p-3" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                <div className="flex gap-2 items-center mb-1 flex-wrap">
                  <Tag_ color="purple">{combo.imageType}</Tag_>
                  <span className="text-xs" style={{ color: "rgba(240,238,255,0.3)" }}>×</span>
                  <Tag_ color="green">{combo.textPattern}</Tag_>
                </div>
                <p className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>{combo.effectiveness}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 文体・口調 */}
        {pj.toneAndStyle && (
          <SectionCard title="文体・口調" icon={FlaskConical}>
            <p className="text-sm mb-2" style={{ color: "rgba(240,238,255,0.75)" }}>{pj.toneAndStyle.description}</p>
            {pj.toneAndStyle.examples && (
              <ul className="space-y-1">
                {pj.toneAndStyle.examples.map((ex, i) => (
                  <li key={i} className="text-xs rounded px-2 py-1" style={{ background: "rgba(139,92,246,0.1)", color: "#c4b5fd" }}>
                    「{ex}」
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}

        {/* アカウント特徴 */}
        {pj.accountCharacteristics && (
          <SectionCard title="アカウント特徴" icon={Users}>
            <p className="text-sm" style={{ color: "rgba(240,238,255,0.75)" }}>{pj.accountCharacteristics}</p>
          </SectionCard>
        )}

        {/* 投稿構成 */}
        {pj.postStructure && (
          <SectionCard title="投稿の構成" icon={BarChart2}>
            <p className="text-sm" style={{ color: "rgba(240,238,255,0.75)" }}>{pj.postStructure}</p>
          </SectionCard>
        )}

        {/* 絵文字の使い方 */}
        {pj.emojiUsage && (
          <SectionCard title="絵文字の使い方" icon={Tag}>
            <p className="text-sm" style={{ color: "rgba(240,238,255,0.75)" }}>{pj.emojiUsage}</p>
          </SectionCard>
        )}
      </div>

      {/* フックパターン */}
      {pj.hookPatterns && pj.hookPatterns.length > 0 && (
        <SectionCard title="フックパターン" icon={Zap}>
          <div className="space-y-3">
            {pj.hookPatterns.map((hp, i) => (
              <div key={i} className="rounded-lg p-3" style={{ background: "rgba(139,92,246,0.08)" }}>
                <p className="text-sm font-medium mb-1" style={{ color: "#c4b5fd" }}>{hp.name}</p>
                <p className="text-xs mb-2" style={{ color: "rgba(240,238,255,0.55)" }}>{hp.description}</p>
                <p className="text-xs italic rounded px-2 py-1" style={{ background: "rgba(0,0,0,0.3)", color: "rgba(240,238,255,0.75)" }}>
                  例: 「{hp.example}」
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* フォロー誘導 */}
      {pj.callToAction && (
        <SectionCard title="Instagram誘導の方法" icon={TrendingUp}>
          <p className="text-sm" style={{ color: "rgba(240,238,255,0.75)" }}>{pj.callToAction}</p>
        </SectionCard>
      )}

      {/* ★キーワードトレンド */}
      {pj.trendingKeywords && (
        <SectionCard title="キーワードトレンド分析" icon={TrendingUp}>
          <div className="space-y-4">
            {pj.trendingKeywords.timeSensitive && pj.trendingKeywords.timeSensitive.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: "#fbbf24" }}>
                  ⏱ 旬のキーワード（期間限定）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pj.trendingKeywords.timeSensitive.map((kw, i) => <Tag_ key={i} color="yellow">{kw}</Tag_>)}
                </div>
              </div>
            )}
            {pj.trendingKeywords.evergreen && pj.trendingKeywords.evergreen.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: "#4ade80" }}>
                  ✓ 常時有効なキーワード
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pj.trendingKeywords.evergreen.map((kw, i) => <Tag_ key={i} color="green">{kw}</Tag_>)}
                </div>
              </div>
            )}
            {pj.trendingKeywords.risky && pj.trendingKeywords.risky.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: "#f87171" }}>
                  ⚠ 使いすぎ注意キーワード
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pj.trendingKeywords.risky.map((kw, i) => <Tag_ key={i} color="red">{kw}</Tag_>)}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* よく扱うトピック */}
        {pj.topicClusters && pj.topicClusters.length > 0 && (
          <SectionCard title="よく扱うトピック" icon={Tag}>
            <div className="flex flex-wrap gap-1.5">
              {pj.topicClusters.map((t, i) => <Tag_ key={i}>{t}</Tag_>)}
            </div>
          </SectionCard>
        )}

        {/* 推奨収集キーワード */}
        {pj.recommendedKeywords && pj.recommendedKeywords.length > 0 && (
          <div
            className="rounded-xl p-4"
            style={{ background: "rgba(15,12,30,0.6)", border: "1px solid rgba(139,92,246,0.1)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Tag className="h-4 w-4" style={{ color: "#a78bfa" }} />
              <div className="flex items-center justify-between flex-1">
                <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>推奨収集キーワード</p>
                <button
                  onClick={copyKeywords}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors"
                  style={{
                    background: copiedKeywords ? "rgba(34,197,94,0.15)" : "rgba(139,92,246,0.15)",
                    color: copiedKeywords ? "#4ade80" : "#c4b5fd",
                    border: `1px solid ${copiedKeywords ? "rgba(34,197,94,0.3)" : "rgba(139,92,246,0.3)"}`,
                  }}
                >
                  {copiedKeywords ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedKeywords ? "コピー済" : "コピー"}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pj.recommendedKeywords.map((kw, i) => <Tag_ key={i}>{kw}</Tag_>)}
            </div>
          </div>
        )}
      </div>

      {/* 避けるべき言葉 */}
      {pj.avoidedWords && pj.avoidedWords.length > 0 && (
        <SectionCard title="シャドウバン注意ワード" icon={AlertTriangle}>
          <div className="flex flex-wrap gap-1.5">
            {pj.avoidedWords.map((w, i) => <Tag_ key={i} color="red">{w}</Tag_>)}
          </div>
        </SectionCard>
      )}

      {/* ★バズ投稿TOP */}
      {pj.topBuzzPosts && pj.topBuzzPosts.length > 0 && (
        <SectionCard title="バズ投稿分析TOP" icon={BarChart2}>
          <div className="space-y-3">
            {pj.topBuzzPosts.map((p, i) => (
              <div key={i} className="rounded-lg p-3" style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.1)" }}>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-xs font-medium" style={{ color: "#c4b5fd" }}>{p.username}</span>
                  <Tag_ color="green">{p.accountAgeSummary}</Tag_>
                  {p.hasImage && <Tag_ color="purple">画像あり</Tag_>}
                  <span className="text-xs ml-auto" style={{ color: "rgba(240,238,255,0.4)" }}>
                    ❤{p.likeCount.toLocaleString()} 🔁{p.repostCount.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs mb-1.5" style={{ color: "rgba(240,238,255,0.7)" }}>「{p.contentSummary}」</p>
                <p className="text-xs" style={{ color: "#fbbf24" }}>→ {p.buzzReason}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─── ジャンルカード ───────────────────────────────────────────
interface GenreCardProps {
  genre: ApiAdultGenre;
  onDeleted: () => void;
}

function GenreCard({ genre, onDeleted }: GenreCardProps) {
  const [expanded, setExpanded]   = useState(false);
  const [accounts, setAccounts]   = useState<ApiReferenceAccount[]>([]);
  const [profile, setProfile]     = useState<ApiGenreProfile | null>(null);
  const [posts, setPosts]         = useState<ApiMonitoredPost[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [showPosts, setShowPosts] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const [accs, profileData, postsData] = await Promise.all([
        getAccountsWithProfile(genre.id),
        getGenreProfile(genre.id),
        getMonitoredPosts(genre.id, 20),
      ]);
      setAccounts(accs);
      setProfile(profileData);
      setPosts(postsData);
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  }, [genre.id]);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) loadDetail();
  };

  // プロファイルのポーリング
  useEffect(() => {
    if (profile?.status === "running" || profile?.status === "pending") {
      const id = setInterval(async () => {
        try {
          const p = await getGenreProfile(genre.id);
          setProfile(p);
          if (p?.status !== "running" && p?.status !== "pending") {
            clearInterval(id);
            // 完了したらアカウント情報と投稿も更新
            const [accs, postsData] = await Promise.all([
              getAccountsWithProfile(genre.id),
              getMonitoredPosts(genre.id, 20),
            ]);
            setAccounts(accs);
            setPosts(postsData);
          }
        } catch {
          clearInterval(id);
        }
      }, 3000);
      return () => clearInterval(id);
    }
  }, [profile?.status, genre.id]);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    setAddingAccount(true);
    try {
      const account = await addReferenceAccount(genre.id, { username: newUsername.trim() });
      setAccounts((prev) => [...prev, account]);
      setNewUsername("");
    } catch (err) {
      alert(`追加失敗: ${err}`);
    } finally {
      setAddingAccount(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    try {
      await deleteReferenceAccount(genre.id, accountId);
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    } catch (err) {
      alert(`削除失敗: ${err}`);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await analyzeGenre(genre.id);
      setProfile({
        id: res.profileId, genreId: genre.id, status: "pending",
        scrapedPostsCount: 0, profileJson: null, errorMessage: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      alert(`分析開始失敗: ${err}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleMonitor = async () => {
    setMonitoring(true);
    try {
      await triggerMonitor(genre.id);
      alert("監視ジョブを開始しました。数分後に更新されます。");
    } catch (err) {
      alert(`監視開始失敗: ${err}`);
    } finally {
      setMonitoring(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`「${genre.name}」を削除しますか？`)) return;
    setDeleting(true);
    try {
      await deleteAdultGenre(genre.id);
      onDeleted();
    } catch (err) {
      alert(`削除失敗: ${err}`);
      setDeleting(false);
    }
  };

  const isRunning = profile?.status === "running" || profile?.status === "pending";

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: "rgba(15,12,30,0.7)",
        border: "1px solid rgba(139,92,246,0.15)",
        backdropFilter: "blur(12px)",
        boxShadow: expanded ? "0 0 24px rgba(139,92,246,0.08)" : "none",
      }}
    >
      {/* カードヘッダー */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer select-none"
        onClick={handleExpand}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(168,85,247,0.2))", border: "1px solid rgba(139,92,246,0.3)" }}
        >
          <FlaskConical className="h-4.5 w-4.5" style={{ color: "#c4b5fd" }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate" style={{ color: "rgba(240,238,255,0.9)" }}>
              {genre.name}
            </h3>
            {genre.latestProfile && <StatusBadge status={genre.latestProfile.status} />}
          </div>
          {genre.description && (
            <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(240,238,255,0.4)" }}>
              {genre.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs" style={{ color: "rgba(240,238,255,0.35)" }}>
            {genre.accountCount ?? 0} アカウント
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            disabled={deleting}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
            style={{ color: "rgba(240,238,255,0.3)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#f87171"; (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(240,238,255,0.3)"; (e.currentTarget as HTMLElement).style.background = ""; }}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
          {expanded ? <ChevronUp className="h-4 w-4" style={{ color: "rgba(240,238,255,0.3)" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "rgba(240,238,255,0.3)" }} />}
        </div>
      </div>

      {/* 展開コンテンツ */}
      {expanded && (
        <div className="px-5 pb-5" style={{ borderTop: "1px solid rgba(139,92,246,0.08)" }}>
          {loadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#a78bfa" }} />
            </div>
          ) : (
            <>
              {/* 参考アカウント一覧（プロフィール情報付き） */}
              <div className="mt-4">
                <p className="text-xs font-semibold mb-2" style={{ color: "rgba(240,238,255,0.4)" }}>
                  参考アカウント
                  {accounts.length > 0 && (
                    <span className="ml-2 font-normal" style={{ color: "rgba(240,238,255,0.25)" }}>
                      ※分析後にフォロワー数・開設日が表示されます
                    </span>
                  )}
                </p>
                {accounts.length === 0 ? (
                  <p className="text-xs" style={{ color: "rgba(240,238,255,0.25)" }}>
                    参考アカウントが登録されていません
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 mb-3">
                    {accounts.map((acc) => (
                      <AccountChip
                        key={acc.id}
                        acc={acc}
                        onDelete={() => handleDeleteAccount(acc.id)}
                      />
                    ))}
                  </div>
                )}

                {/* アカウント追加フォーム */}
                <form onSubmit={handleAddAccount} className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="@username"
                    className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none transition-colors"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(139,92,246,0.2)",
                      color: "rgba(240,238,255,0.85)",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={addingAccount || !newUsername.trim()}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, rgba(124,58,237,0.5), rgba(168,85,247,0.3))",
                      border: "1px solid rgba(139,92,246,0.4)",
                      color: "#c4b5fd",
                    }}
                  >
                    {addingAccount ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    追加
                  </button>
                </form>
              </div>

              {/* アクションボタン */}
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                {/* 分析開始 */}
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing || isRunning || accounts.length === 0}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(168,85,247,0.4))",
                    border: "1px solid rgba(139,92,246,0.5)",
                    color: "#e9d5ff",
                    boxShadow: "0 0 12px rgba(139,92,246,0.2)",
                  }}
                >
                  {analyzing || isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {isRunning ? "分析中..." : "分析開始"}
                </button>

                {/* 監視ジョブ */}
                <button
                  onClick={handleMonitor}
                  disabled={monitoring || accounts.length === 0}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:opacity-50"
                  style={{
                    background: "rgba(59,130,246,0.15)",
                    border: "1px solid rgba(59,130,246,0.3)",
                    color: "#60a5fa",
                  }}
                >
                  {monitoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  スコア監視
                </button>

                {/* スコア監視ダッシュボード */}
                <Link
                  href={`/research/${genre.id}/monitor`}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all"
                  style={{
                    background: "rgba(251,191,36,0.12)",
                    border: "1px solid rgba(251,191,36,0.25)",
                    color: "#fbbf24",
                  }}
                >
                  <Activity className="h-4 w-4" />
                  推移グラフ
                </Link>

                {/* 成長分析 */}
                <Link
                  href={`/research/${genre.id}/growth`}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all"
                  style={{
                    background: "rgba(34,197,94,0.12)",
                    border: "1px solid rgba(34,197,94,0.25)",
                    color: "#4ade80",
                  }}
                >
                  <LineChart className="h-4 w-4" />
                  成長分析
                </Link>

                {profile && (
                  <div className="flex items-center gap-2">
                    <StatusBadge status={profile.status} />
                    {profile.errorMessage && profile.status !== "completed" && (
                      <span className="text-xs" style={{ color: "rgba(240,238,255,0.4)" }}>
                        {profile.errorMessage}
                      </span>
                    )}
                    {profile.scrapedPostsCount > 0 && (
                      <span className="text-xs" style={{ color: "rgba(240,238,255,0.35)" }}>
                        {profile.scrapedPostsCount}件収集済
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 監視投稿一覧 */}
              {posts.length > 0 && (
                <div className="mt-5">
                  <button
                    onClick={() => setShowPosts((v) => !v)}
                    className="flex items-center gap-2 text-xs font-semibold mb-3"
                    style={{ color: "rgba(240,238,255,0.45)" }}
                  >
                    <BarChart2 className="h-3.5 w-3.5" />
                    監視中の投稿 ({posts.length}件) — バズスコア順
                    {showPosts ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {showPosts && (
                    <div className="space-y-2">
                      {posts.map((p) => <MonitoredPostCard key={p.id} post={p} />)}
                    </div>
                  )}
                </div>
              )}

              {/* プロファイル表示 */}
              {profile?.status === "completed" && profile.profileJson && (
                <ProfileView profile={profile} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────
export default function ResearchPage() {
  const [genres, setGenres]   = useState<ApiAdultGenre[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadGenres = useCallback(async () => {
    try {
      const data = await getAdultGenres();
      setGenres(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGenres();
  }, [loadGenres]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const genre = await createAdultGenre({ name: newName.trim(), description: newDesc.trim() || undefined });
      setGenres((prev) => [{ ...genre, accountCount: 0, latestProfile: null }, ...prev]);
      setNewName("");
      setNewDesc("");
      setShowForm(false);
    } catch (err) {
      alert(`作成失敗: ${err}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              boxShadow: "0 0 20px rgba(139,92,246,0.4)",
            }}
          >
            <FlaskConical className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "rgba(240,238,255,0.95)" }}>
              ジャンル別リサーチ
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "rgba(240,238,255,0.35)" }}>
              ジャンル別に参考アカウントを登録 → プロフィール・バズ分析 → スコア監視・成長分析・勝ちパターン発見
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all"
          style={{
            background: showForm
              ? "rgba(139,92,246,0.15)"
              : "linear-gradient(135deg, rgba(124,58,237,0.5), rgba(168,85,247,0.3))",
            border: "1px solid rgba(139,92,246,0.4)",
            color: "#c4b5fd",
          }}
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "キャンセル" : "ジャンル追加"}
        </button>
      </div>

      {/* ジャンル追加フォーム */}
      {showForm && (
        <div
          className="rounded-2xl p-5"
          style={{
            background: "rgba(15,12,30,0.8)",
            border: "1px solid rgba(139,92,246,0.2)",
            backdropFilter: "blur(12px)",
          }}
        >
          <p className="text-sm font-semibold mb-4" style={{ color: "rgba(240,238,255,0.8)" }}>
            新しいジャンルを追加
          </p>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "rgba(240,238,255,0.45)" }}>
                ジャンル名 *
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例: ビジネス系・子育て・グルメ・フィットネス・コスプレ"
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(139,92,246,0.2)",
                  color: "rgba(240,238,255,0.85)",
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "rgba(240,238,255,0.45)" }}>
                説明（任意）
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="ジャンルの特徴や対象読者を入力"
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(139,92,246,0.2)",
                  color: "rgba(240,238,255,0.85)",
                }}
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-medium transition-all disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                  color: "white",
                  boxShadow: "0 0 16px rgba(139,92,246,0.35)",
                }}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                作成
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ジャンル一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#a78bfa" }} />
        </div>
      ) : genres.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-2xl py-16"
          style={{
            background: "rgba(15,12,30,0.6)",
            border: "1px dashed rgba(139,92,246,0.2)",
          }}
        >
          <FlaskConical className="h-10 w-10 mb-3" style={{ color: "rgba(139,92,246,0.3)" }} />
          <p className="text-sm" style={{ color: "rgba(240,238,255,0.35)" }}>
            ジャンルがまだありません
          </p>
          <p className="text-xs mt-1" style={{ color: "rgba(240,238,255,0.2)" }}>
            「ジャンル追加」ボタンから追加してください
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {genres.map((genre) => (
            <GenreCard
              key={genre.id}
              genre={genre}
              onDeleted={() => setGenres((prev) => prev.filter((g) => g.id !== genre.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
