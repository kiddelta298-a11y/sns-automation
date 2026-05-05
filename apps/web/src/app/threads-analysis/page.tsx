"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ScraperEngineToggle } from "@/components/settings/scraper-engine-toggle";
import {
  getAdultGenres,
  createAdultGenre,
  deleteAdultGenre,
  getAccountsWithProfile,
  bulkAddReferenceAccounts,
  deleteReferenceAccount,
  analyzeGenre,
  getGenreProfile,
  getMonitoredPostsFiltered,
  triggerMonitor,
  getMonitorJobStatus,
  getAnalyzeJobStatus,
  getAccounts,
  startResearchAutoPostMulti,
  getAutoPostStatusMulti,
  createPost,
  getInstagramPendingImages,
  postInstagramFromFolder,
  type ApiAdultGenre,
  type ApiReferenceAccount,
  type ApiGenreProfile,
  type ApiMonitoredPost,
  type ApiAccount,
  type MonitoredPostsFilter,
  type MonitorJobStatus,
  type AnalyzeJobStatus,
  type AutoPostStatusResult,
  type InstagramPendingImage,
} from "@/lib/api";
import {
  Users, Plus, Trash2, Play, ChevronDown, ChevronUp, Copy, Check,
  Loader2, X, RefreshCw, Filter, Settings, TrendingUp, Zap,
  BarChart2, Activity, Layers, Image as ImageIcon,
  AlertTriangle, Tag as TagIcon, FlaskConical, ExternalLink, Link2,
  Send, Clock, Trophy,
} from "lucide-react";

// ─── URL → username 抽出 ──────────────────────────────
// Threadsのプロフィール/投稿URL、または @username 形式を受け付ける
function extractUsernameFromInput(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const urlMatch = s.match(/threads\.(?:net|com)\/@([A-Za-z0-9._]+)/i);
  if (urlMatch) return urlMatch[1];
  const atMatch = s.match(/^@?([A-Za-z0-9._]+)$/);
  if (atMatch) return atMatch[1];
  return null;
}

function toProfileUrl(username: string): string {
  return `https://www.threads.net/@${username}`;
}

const GLASS = {
  card: { background: "rgba(15,12,30,0.7)", border: "1px solid rgba(139,92,246,0.15)" },
  inner: { background: "rgba(15,12,30,0.5)", border: "1px solid rgba(139,92,246,0.1)" },
  input: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(139,92,246,0.2)",
    color: "rgba(240,238,255,0.85)",
  },
  btnPrimary: {
    background: "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(168,85,247,0.4))",
    border: "1px solid rgba(139,92,246,0.5)",
    color: "#e9d5ff",
    boxShadow: "0 0 12px rgba(139,92,246,0.2)",
  },
  btnSecondary: {
    background: "rgba(59,130,246,0.15)",
    border: "1px solid rgba(59,130,246,0.3)",
    color: "#60a5fa",
  },
  btnGhost: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(139,92,246,0.2)",
    color: "rgba(240,238,255,0.7)",
  },
} as const;

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "rgba(234,179,8,0.15)", text: "#fbbf24", label: "待機中" },
  running: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", label: "実行中" },
  completed: { bg: "rgba(34,197,94,0.15)", text: "#4ade80", label: "完了" },
  failed: { bg: "rgba(239,68,68,0.15)", text: "#f87171", label: "失敗" },
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

// ─── URL入力リスト（1枠1URL＋追加ボタン） ──────────────
function UrlInputList({
  urls, onChange, placeholder,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  placeholder?: string;
}) {
  const setAt = (i: number, v: string) => {
    const next = [...urls];
    next[i] = v;
    onChange(next);
  };
  const add = () => onChange([...urls, ""]);
  const remove = (i: number) => {
    if (urls.length === 1) {
      onChange([""]);
      return;
    }
    onChange(urls.filter((_, j) => j !== i));
  };

  return (
    <div className="space-y-2">
      {urls.map((url, i) => {
        const extracted = extractUsernameFromInput(url);
        const showWarning = url.trim() !== "" && !extracted;
        return (
          <div key={i} className="flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(139,92,246,0.5)" }} />
            <input
              type="text"
              value={url}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder={placeholder ?? "https://www.threads.net/@username"}
              className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none font-mono"
              style={GLASS.input}
            />
            {extracted ? (
              <a
                href={toProfileUrl(extracted)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded px-2 py-1 text-[10px] transition-colors shrink-0"
                style={{
                  color: "#4ade80",
                  background: "rgba(34,197,94,0.1)",
                  border: "1px solid rgba(34,197,94,0.2)",
                }}
                title="プロフィールを新しいタブで開く"
              >
                <ExternalLink className="h-3 w-3" />@{extracted}
              </a>
            ) : showWarning ? (
              <span className="text-[10px] shrink-0" style={{ color: "#f87171" }}>
                URL形式が認識できません
              </span>
            ) : null}
            <button
              onClick={() => remove(i)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors"
              style={{ color: "rgba(240,238,255,0.3)" }}
              title="この行を削除"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      <button
        onClick={add}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-all"
        style={{
          background: "rgba(139,92,246,0.08)",
          border: "1px dashed rgba(139,92,246,0.35)",
          color: "#c4b5fd",
        }}
      >
        <Plus className="h-3 w-3" />
        URLを追加
      </button>
    </div>
  );
}

// ─── エンゲージメントフィルタバー ───────────────────────
interface EngagementFilter {
  minLikes: string;
  maxLikes: string;
  minReplies: string;
  maxReplies: string;
  minViews: string;
  maxViews: string;
  minReposts: string;
  maxReposts: string;
}

const EMPTY_FILTER: EngagementFilter = {
  minLikes: "", maxLikes: "",
  minReplies: "", maxReplies: "",
  minViews: "", maxViews: "",
  minReposts: "", maxReposts: "",
};

function filterToQuery(f: EngagementFilter): MonitoredPostsFilter {
  // インプレッション順がデフォルト（ユーザー要望）
  const out: MonitoredPostsFilter = { limit: 100, orderBy: "views" };
  const n = (v: string) => (v === "" ? undefined : Number(v));
  out.minLikes = n(f.minLikes);
  out.maxLikes = n(f.maxLikes);
  out.minReplies = n(f.minReplies);
  out.maxReplies = n(f.maxReplies);
  out.minViews = n(f.minViews);
  out.maxViews = n(f.maxViews);
  out.minReposts = n(f.minReposts);
  out.maxReposts = n(f.maxReposts);
  return out;
}

function FilterBar({
  filter, onChange, onReset,
}: {
  filter: EngagementFilter;
  onChange: (f: EngagementFilter) => void;
  onReset: () => void;
}) {
  const set = (k: keyof EngagementFilter, v: string | boolean) => onChange({ ...filter, [k]: v });
  const numField = (k: keyof EngagementFilter, placeholder: string) => (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      value={filter[k] as string}
      onChange={(e) => set(k, e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      placeholder={placeholder}
      className="w-full min-w-0 rounded px-2 py-1 text-xs outline-none"
      style={GLASS.input}
    />
  );

  return (
    <div className="rounded-xl p-3 space-y-2.5" style={GLASS.inner}>
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5" style={{ color: "#a78bfa" }} />
        <span className="text-xs font-semibold" style={{ color: "#a78bfa" }}>
          エンゲージメントフィルター
        </span>
        <button
          onClick={onReset}
          className="ml-auto rounded px-2 py-0.5 text-[10px] transition-colors"
          style={{ color: "rgba(240,238,255,0.4)" }}
        >
          リセット
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        <FilterRow label="いいね" icon="❤" min={numField("minLikes", "下限")} max={numField("maxLikes", "上限")} />
        <FilterRow label="リプライ" icon="💬" min={numField("minReplies", "下限")} max={numField("maxReplies", "上限")} />
        <FilterRow label="インプレ" icon="👁" min={numField("minViews", "下限")} max={numField("maxViews", "上限")} />
        <FilterRow label="リポスト" icon="🔁" min={numField("minReposts", "下限")} max={numField("maxReposts", "上限")} />
      </div>
    </div>
  );
}

function FilterRow({ label, icon, min, max }: { label: string; icon: string; min: React.ReactNode; max: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 min-w-0">
      <span className="text-xs whitespace-nowrap" style={{ color: "rgba(240,238,255,0.55)" }}>
        {icon} {label}
      </span>
      {min}
      <span className="text-xs" style={{ color: "rgba(240,238,255,0.3)" }}>〜</span>
      {max}
    </div>
  );
}

// ─── 監視ジョブの進捗表示 ─────────────────────────────
function MonitorProgress({ status }: { status: MonitorJobStatus | null }) {
  const p = status?.progress;
  const isObj = p && typeof p === "object";
  const state = status?.state ?? "waiting";

  const stateLabel =
    state === "completed" ? "完了"
    : state === "failed" ? "失敗"
    : state === "active" ? "実行中"
    : state === "waiting" ? "待機中"
    : state === "delayed" ? "遅延"
    : state;

  const stateColor =
    state === "completed" ? "#4ade80"
    : state === "failed" ? "#f87171"
    : state === "active" ? "#60a5fa"
    : "#fbbf24";

  const totalAccounts = (isObj && "totalAccounts" in p && typeof p.totalAccounts === "number") ? p.totalAccounts : 0;
  const accountIndex = (isObj && "accountIndex" in p && typeof p.accountIndex === "number") ? p.accountIndex : 0;
  const currentAccount = (isObj && "currentAccount" in p && typeof p.currentAccount === "string") ? p.currentAccount : null;
  const targetMatches = (isObj && "targetMatches" in p && typeof p.targetMatches === "number") ? p.targetMatches : 0;
  const matchedCount = (isObj && "matchedCount" in p && typeof p.matchedCount === "number") ? p.matchedCount : 0;
  const processedCount = (isObj && "processedCount" in p && typeof p.processedCount === "number") ? p.processedCount : 0;
  const message = (isObj && "message" in p && typeof p.message === "string") ? p.message : "ジョブ起動中...";
  const newPosts = (isObj && "newPosts" in p && typeof p.newPosts === "number") ? p.newPosts : 0;
  const updatedPosts = (isObj && "updatedPosts" in p && typeof p.updatedPosts === "number") ? p.updatedPosts : 0;

  const pctAccount = totalAccounts > 0 ? Math.round((accountIndex / totalAccounts) * 100) : 0;
  const pctMatch = targetMatches > 0 ? Math.min(100, Math.round((matchedCount / targetMatches) * 100)) : 0;

  return (
    <div className="rounded-xl p-3 space-y-2" style={GLASS.inner}>
      <div className="flex items-center gap-2 flex-wrap">
        <Activity className="h-3.5 w-3.5 animate-pulse" style={{ color: stateColor }} />
        <span className="text-xs font-semibold" style={{ color: stateColor }}>
          投稿収集ジョブ — {stateLabel}
        </span>
        {status?.data?.limit !== undefined && (
          <span className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>
            （抽出上限 {status.data.limit} 件/人）
          </span>
        )}
        <span className="ml-auto text-[10px]" style={{ color: "rgba(240,238,255,0.5)" }}>
          新規 {newPosts} / 更新 {updatedPosts}
        </span>
      </div>
      <p className="text-xs" style={{ color: "rgba(240,238,255,0.75)" }}>
        {message}
      </p>
      {totalAccounts > 0 && (
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: "rgba(240,238,255,0.5)" }}>
            <span>
              アカウント {accountIndex}/{totalAccounts}
              {currentAccount && <span style={{ color: "#c4b5fd" }}> — @{currentAccount}</span>}
            </span>
            <span>{pctAccount}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(139,92,246,0.12)" }}>
            <div className="h-full transition-all duration-500" style={{
              width: `${pctAccount}%`,
              background: "linear-gradient(90deg, #a78bfa, #f0abfc)",
            }} />
          </div>
        </div>
      )}
      {targetMatches > 0 && (
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: "rgba(240,238,255,0.5)" }}>
            <span>
              合致 {matchedCount}/{targetMatches} 件
              <span style={{ color: "rgba(240,238,255,0.35)" }}>（処理済 {processedCount} URL）</span>
            </span>
            <span>{pctMatch}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(59,130,246,0.12)" }}>
            <div className="h-full transition-all duration-500" style={{
              width: `${pctMatch}%`,
              background: "linear-gradient(90deg, #60a5fa, #a78bfa)",
            }} />
          </div>
        </div>
      )}
      {state === "failed" && status?.failedReason && (
        <p className="text-[10px] rounded p-2" style={{ color: "#f87171", background: "rgba(239,68,68,0.08)" }}>
          {status.failedReason}
        </p>
      )}
    </div>
  );
}

// ─── テキスト整形（表示用）────────────────────────────────
function stripForDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw;
  s = s.replace(/(^|\s)(?:Translate|翻訳を見る|翻訳|See translation|Translated from \w+)(\s|$)/gi, "$1$2");
  s = s.replace(/(?:View\s+activity|アクティビティを見る|View\s+post\s+activity|View\s+insights|Insights)+/gi, "");
  s = s.replace(/(^|\s)\d{1,2}\s*\/\s*\d{1,2}(\s|$)/g, "$1$2");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return s;
}

// ─── 投稿カード ─────────────────────────────────────────
function PostingStatusBadge({ status, at }: { status?: "posted" | "scheduled" | "unposted"; at?: string | null }) {
  if (!status || status === "unposted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={{ background: "rgba(255,255,255,0.04)", color: "rgba(240,238,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
        未投稿
      </span>
    );
  }
  if (status === "scheduled") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
        <Clock className="h-2.5 w-2.5" />投稿待ち
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: "rgba(34,197,94,0.18)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.4)" }}
      title={at ? `投稿日時: ${new Date(at).toLocaleString("ja-JP")}` : undefined}>
      <Check className="h-2.5 w-2.5" />投稿済
    </span>
  );
}

function PostCard({ post, onCopy, isScheduled }: { post: ApiMonitoredPost; onCopy: (text: string) => void; isScheduled?: boolean }) {
  const [copied, setCopied] = useState(false);
  const displayText = stripForDisplay(post.contentText);
  const handleCopy = () => {
    onCopy(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const postUrl = post.platformPostId
    ? (post.platformPostId.startsWith("http")
        ? post.platformPostId
        : `https://www.threads.net${post.platformPostId.startsWith("/") ? "" : "/"}${post.platformPostId}`)
    : null;
  return (
    <div className="rounded-xl p-3 space-y-2" style={GLASS.inner}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-relaxed flex-1 whitespace-pre-wrap" style={{ color: "rgba(240,238,255,0.8)" }}>
          {displayText.substring(0, 220)}{displayText.length > 220 ? "…" : ""}
        </p>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {isScheduled && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
              <Clock className="h-2.5 w-2.5" />予約済み
            </span>
          )}
          <PostingStatusBadge status={post.postingStatus} at={post.autoPostedAt} />
          {/* 画像あり/なしを必ず表示（既存データでも has_image を見て判定される） */}
          {post.hasImage ? (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                background: "rgba(139,92,246,0.18)",
                color: "#c4b5fd",
                border: "1px solid rgba(139,92,246,0.35)",
              }}
              title={`画像あり（${(post.imageUrls ?? []).length}枚）`}>
              <ImageIcon className="h-3 w-3" />画像あり
              {(post.imageUrls ?? []).length > 1 && (
                <span className="ml-0.5 opacity-75">×{(post.imageUrls ?? []).length}</span>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "rgba(240,238,255,0.4)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              title="画像なし（テキストのみの投稿）">
              <ImageIcon className="h-3 w-3 opacity-50" />画像なし
            </span>
          )}
          {postUrl && (
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] transition-colors"
              style={{
                background: "rgba(59,130,246,0.12)",
                color: "#60a5fa",
                border: "1px solid rgba(59,130,246,0.25)",
              }}
              title="投稿を新しいタブで開く"
            >
              <ExternalLink className="h-3 w-3" />投稿URL
            </a>
          )}
        </div>
      </div>
      {/* メトリクス: 視認性を上げるため、強調色とサイズを引き上げ */}
      <div className="flex items-center gap-2 flex-wrap pt-1" style={{ borderTop: "1px solid rgba(139,92,246,0.08)" }}>
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold tabular-nums"
          style={{ background: "rgba(96,165,250,0.12)", color: "#93c5fd", border: "1px solid rgba(96,165,250,0.25)" }}
          title="インプレッション数">
          👁 {post.viewCount.toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold tabular-nums"
          style={{ background: "rgba(244,114,182,0.12)", color: "#f9a8d4", border: "1px solid rgba(244,114,182,0.25)" }}
          title="いいね数">
          ❤ {post.likeCount.toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs tabular-nums"
          style={{ background: "rgba(240,238,255,0.04)", color: "rgba(240,238,255,0.6)" }}
          title="リプライ数">
          💬 {post.replyCount.toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs tabular-nums"
          style={{ background: "rgba(240,238,255,0.04)", color: "rgba(240,238,255,0.6)" }}
          title="リポスト数">
          🔁 {post.repostCount.toLocaleString()}
        </span>
        {post.postedAt && (
          <span className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>
            {new Date(post.postedAt).toLocaleDateString("ja-JP")}
          </span>
        )}
        <button
          onClick={handleCopy}
          className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-[10px] transition-colors"
          style={{
            background: copied ? "rgba(34,197,94,0.15)" : "rgba(139,92,246,0.12)",
            color: copied ? "#4ade80" : "#c4b5fd",
            border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "rgba(139,92,246,0.25)"}`,
          }}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "コピー済" : "種コピー"}
        </button>
      </div>
    </div>
  );
}

// ─── プロファイル要約表示 ──────────────────────────────
function ProfileSummary({ profile }: { profile: ApiGenreProfile }) {
  const pj = profile.profileJson;
  if (!pj) return null;
  return (
    <div className="rounded-xl p-4 space-y-3" style={GLASS.inner}>
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4" style={{ color: "#a78bfa" }} />
        <span className="text-xs font-semibold" style={{ color: "#a78bfa" }}>
          分析サマリー（共通バズ要素）
        </span>
      </div>
      {pj.genreSummary && (
        <p className="text-sm" style={{ color: "rgba(240,238,255,0.85)" }}>{pj.genreSummary}</p>
      )}
      {pj.buzzTriggers && pj.buzzTriggers.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#fbbf24" }}>
            <TrendingUp className="inline h-3 w-3 mr-1" />バズのトリガー
          </p>
          <ul className="space-y-1.5">
            {pj.buzzTriggers.slice(0, 5).map((bt, i) => (
              <li key={i} className="text-xs rounded p-2" style={{ background: "rgba(251,191,36,0.06)" }}>
                <span className="font-medium" style={{ color: "#fbbf24" }}>{bt.trigger}</span>
                <span className="mx-1" style={{ color: "rgba(240,238,255,0.3)" }}>—</span>
                <span style={{ color: "rgba(240,238,255,0.7)" }}>{bt.mechanism}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pj.hookPatterns && pj.hookPatterns.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#c4b5fd" }}>
            <Zap className="inline h-3 w-3 mr-1" />フックパターン
          </p>
          <ul className="space-y-1">
            {pj.hookPatterns.slice(0, 4).map((hp, i) => (
              <li key={i} className="text-xs" style={{ color: "rgba(240,238,255,0.7)" }}>
                <span style={{ color: "#c4b5fd" }}>{hp.name}:</span> {hp.example && `「${hp.example}」`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pj.topBuzzPosts && pj.topBuzzPosts.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#4ade80" }}>
            <BarChart2 className="inline h-3 w-3 mr-1" />バズ投稿TOP（分析時スナップショット）
          </p>
          <ul className="space-y-1.5">
            {pj.topBuzzPosts.slice(0, 3).map((p, i) => (
              <li key={i} className="text-xs rounded p-2" style={{ background: "rgba(34,197,94,0.06)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ color: "#c4b5fd" }}>{p.username}</span>
                  <span className="ml-auto" style={{ color: "rgba(240,238,255,0.4)" }}>
                    ❤{p.likeCount.toLocaleString()} 🔁{p.repostCount.toLocaleString()}
                  </span>
                </div>
                <p style={{ color: "rgba(240,238,255,0.7)" }}>「{p.contentSummary}」</p>
                <p className="mt-1" style={{ color: "#fbbf24" }}>→ {p.buzzReason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── グループカード ─────────────────────────────────────
function GroupCard({ group, onDeleted, onUpdated }: {
  group: ApiAdultGenre;
  onDeleted: () => void;
  onUpdated: (g: ApiAdultGenre) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [accounts, setAccounts] = useState<ApiReferenceAccount[]>([]);
  const [profile, setProfile] = useState<ApiGenreProfile | null>(null);
  const [posts, setPosts] = useState<ApiMonitoredPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [bulkUrls, setBulkUrls] = useState<string[]>([""]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ added: number; skipped: number; invalid: number } | null>(null);

  const [filter, setFilter] = useState<EngagementFilter>(EMPTY_FILTER);
  const [postsLoading, setPostsLoading] = useState(false);
  const [copyNotice, setCopyNotice] = useState(false);

  // 投稿収集ジョブの状態
  const [monitorLimit, setMonitorLimit] = useState<string>("30");
  const [monitorJobId, setMonitorJobId] = useState<string | null>(null);
  const [monitorStatus, setMonitorStatus] = useState<MonitorJobStatus | null>(null);

  // 分析ジョブ（一括分析）の進捗
  const [analyzeJobId, setAnalyzeJobId] = useState<string | null>(null);
  const [analyzeStatus, setAnalyzeStatus] = useState<AnalyzeJobStatus | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, profileData, postsData] = await Promise.all([
        getAccountsWithProfile(group.id),
        getGenreProfile(group.id),
        getMonitoredPostsFiltered(group.id, filterToQuery(filter)),
      ]);
      setAccounts(accs);
      setProfile(profileData);
      setPosts(postsData);
    } finally {
      setLoading(false);
    }
  }, [group.id, filter]);

  const refetchPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const data = await getMonitoredPostsFiltered(group.id, filterToQuery(filter));
      setPosts(data);
    } finally {
      setPostsLoading(false);
    }
  }, [group.id, filter]);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && accounts.length === 0) loadDetail();
  };

  useEffect(() => {
    if (expanded) refetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.minLikes, filter.maxLikes, filter.minReplies, filter.maxReplies,
      filter.minViews, filter.maxViews, filter.minReposts, filter.maxReposts]);

  // 分析ジョブのポーリング
  useEffect(() => {
    if (profile?.status === "running" || profile?.status === "pending") {
      const id = setInterval(async () => {
        const p = await getGenreProfile(group.id);
        setProfile(p);
        if (p?.status !== "running" && p?.status !== "pending") {
          clearInterval(id);
          const accs = await getAccountsWithProfile(group.id);
          setAccounts(accs);
          refetchPosts();
        }
      }, 3000);
      return () => clearInterval(id);
    }
  }, [profile?.status, group.id, refetchPosts]);

  const parseUrlList = (urls: string[]): { usernames: string[]; invalid: number } => {
    const filled = urls.map((u) => u.trim()).filter((u) => u.length > 0);
    const extracted: string[] = [];
    let invalid = 0;
    for (const u of filled) {
      const name = extractUsernameFromInput(u);
      if (name) extracted.push(name);
      else invalid++;
    }
    return { usernames: [...new Set(extracted)], invalid };
  };

  const handleBulkAdd = async (alsoAnalyze = false) => {
    const { usernames, invalid } = parseUrlList(bulkUrls);
    if (usernames.length === 0) {
      if (invalid > 0) alert("有効なThreads URLがありません");
      return;
    }
    setBulkSubmitting(true);
    setBulkResult(null);
    try {
      const res = await bulkAddReferenceAccounts(group.id, { usernames });
      setAccounts((prev) => [...prev, ...res.added]);
      setBulkResult({ added: res.added.length, skipped: res.skipped.length, invalid });
      setBulkUrls([""]);
      if (alsoAnalyze) {
        await handleAnalyze();
      }
    } catch (err) {
      alert(`追加失敗: ${err}`);
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    try {
      await deleteReferenceAccount(group.id, accountId);
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    } catch (err) {
      alert(`削除失敗: ${err}`);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await analyzeGenre(group.id);
      setProfile({
        id: res.profileId, genreId: group.id, status: "pending",
        scrapedPostsCount: 0, profileJson: null, errorMessage: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      if (res.jobId) setAnalyzeJobId(res.jobId);
    } catch (err) {
      alert(`分析開始失敗: ${err}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleMonitor = async () => {
    const parsedLimit = parseInt(monitorLimit);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 30;
    setMonitoring(true);
    setMonitorStatus(null);
    try {
      const n = (v: string) => {
        if (v === "") return undefined;
        const x = Number(v);
        return Number.isFinite(x) && x >= 0 ? x : undefined;
      };
      const mf = {
        minLikes: n(filter.minLikes),
        maxLikes: n(filter.maxLikes),
        minReplies: n(filter.minReplies),
        maxReplies: n(filter.maxReplies),
        minViews: n(filter.minViews),
        maxViews: n(filter.maxViews),
        minReposts: n(filter.minReposts),
        maxReposts: n(filter.maxReposts),
      };
      const hasAny =
        mf.minLikes != null || mf.maxLikes != null ||
        mf.minReplies != null || mf.maxReplies != null ||
        mf.minViews != null || mf.maxViews != null ||
        mf.minReposts != null || mf.maxReposts != null;
      const res = await triggerMonitor(group.id, {
        limit,
        filter: hasAny ? mf : undefined,
      });
      setMonitorJobId(res.jobId);
    } catch (err) {
      alert(`監視開始失敗: ${err}`);
    } finally {
      setMonitoring(false);
    }
  };

  // 監視ジョブ進捗ポーリング
  useEffect(() => {
    if (!monitorJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await getMonitorJobStatus(monitorJobId);
        if (cancelled) return;
        setMonitorStatus(s);
        if (s.state === "completed" || s.state === "failed") {
          // 最終状態：一度だけ投稿再取得
          refetchPosts();
          // 5秒後にジョブIDをクリアして表示を消す
          setTimeout(() => {
            if (!cancelled) { setMonitorJobId(null); setMonitorStatus(null); }
          }, 8000);
          return;
        }
      } catch {
        // noop
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [monitorJobId, refetchPosts]);

  // 分析ジョブ進捗ポーリング
  useEffect(() => {
    if (!analyzeJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await getAnalyzeJobStatus(analyzeJobId);
        if (cancelled) return;
        setAnalyzeStatus(s);
        if (s.state === "completed" || s.state === "failed") {
          refetchPosts();
          setTimeout(() => {
            if (!cancelled) { setAnalyzeJobId(null); setAnalyzeStatus(null); }
          }, 8000);
          return;
        }
      } catch { /* noop */ }
    };
    poll();
    const id = setInterval(poll, 2500);
    return () => { cancelled = true; clearInterval(id); };
  }, [analyzeJobId, refetchPosts]);

  const handleDelete = async () => {
    if (!confirm(`グループ「${group.name}」を削除しますか？`)) return;
    setDeleting(true);
    try {
      await deleteAdultGenre(group.id);
      onDeleted();
    } catch (err) {
      alert(`削除失敗: ${err}`);
      setDeleting(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice(true);
      setTimeout(() => setCopyNotice(false), 2000);
    } catch {
      // noop
    }
  };

  const isRunning = profile?.status === "running" || profile?.status === "pending";

  return (
    <div className="rounded-2xl overflow-hidden transition-all" style={{
      ...GLASS.card,
      backdropFilter: "blur(12px)",
      boxShadow: expanded ? "0 0 24px rgba(139,92,246,0.08)" : "none",
    }}>
      {/* ヘッダー */}
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer select-none" onClick={handleExpand}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(168,85,247,0.2))",
          border: "1px solid rgba(139,92,246,0.3)",
        }}>
          <Layers className="h-4 w-4" style={{ color: "#c4b5fd" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate" style={{ color: "rgba(240,238,255,0.9)" }}>
              {group.name}
            </h3>
            {group.latestProfile && <StatusBadge status={group.latestProfile.status} />}
          </div>
          {group.description && (
            <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(240,238,255,0.4)" }}>
              {group.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {monitorJobId && (() => {
            const p = monitorStatus?.progress;
            const isObj = p && typeof p === "object";
            const matched = (isObj && "matchedCount" in p && typeof p.matchedCount === "number") ? p.matchedCount : 0;
            const target = (isObj && "targetMatches" in p && typeof p.targetMatches === "number") ? p.targetMatches : 0;
            return (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)" }}>
                <Loader2 className="h-3 w-3 animate-spin" />
                収集中 {matched}{target > 0 ? `/${target}` : ""}件
              </span>
            );
          })()}
          <span className="text-xs" style={{ color: "rgba(240,238,255,0.35)" }}>
            {group.accountCount ?? 0} アカウント
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            disabled={deleting}
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ color: "rgba(240,238,255,0.3)" }}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
          {expanded ? <ChevronUp className="h-4 w-4" style={{ color: "rgba(240,238,255,0.3)" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "rgba(240,238,255,0.3)" }} />}
        </div>
      </div>
      {/* 収集ジョブ進捗バー — カードが折り畳まれていても常に表示 */}
      {monitorJobId && monitorStatus && (() => {
        const p = monitorStatus.progress;
        const isObj = p && typeof p === "object";
        const matched = (isObj && "matchedCount" in p && typeof p.matchedCount === "number") ? p.matchedCount : 0;
        const target = (isObj && "targetMatches" in p && typeof p.targetMatches === "number") ? p.targetMatches : 0;
        const msg = (isObj && "message" in p && typeof p.message === "string") ? p.message : "";
        const pct = target > 0 ? Math.min(100, Math.round((matched / target) * 100)) : 0;
        return (
          <div className="px-5 py-2" style={{ borderTop: "1px solid rgba(59,130,246,0.15)", background: "rgba(59,130,246,0.04)" }}>
            <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: "rgba(240,238,255,0.6)" }}>
              <span className="flex items-center gap-1.5">
                <Activity className="h-3 w-3 animate-pulse" style={{ color: "#60a5fa" }} />
                {msg || "投稿を収集中..."}
              </span>
              <span style={{ color: "#60a5fa" }}>{matched}{target > 0 ? `/${target}` : ""}件</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(59,130,246,0.12)" }}>
              <div className="h-full transition-all duration-500" style={{
                width: target > 0 ? `${pct}%` : "100%",
                background: target > 0 ? "linear-gradient(90deg, #60a5fa, #a78bfa)" : "transparent",
                animation: target === 0 ? "none" : undefined,
              }} />
            </div>
          </div>
        );
      })()}

      {/* 展開コンテンツ */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4" style={{ borderTop: "1px solid rgba(139,92,246,0.08)" }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#a78bfa" }} />
            </div>
          ) : (
            <>
              {/* 一括入力 */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" style={{ color: "#a78bfa" }} />
                  <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>
                    分析対象アカウント
                  </p>
                  <span className="text-xs" style={{ color: "rgba(240,238,255,0.4)" }}>
                    （{accounts.length}件 / 上限なし・1件からでも分析可）
                  </span>
                </div>
                {accounts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {accounts.map((acc) => (
                      <span key={acc.id} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
                        style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
                        <a
                          href={toProfileUrl(acc.username)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                          style={{ color: "#c4b5fd" }}
                          title="プロフィールを新しいタブで開く"
                        >
                          @{acc.username}
                          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                        </a>
                        {acc.followersCount !== null && acc.followersCount !== undefined && (
                          <span style={{ color: "rgba(240,238,255,0.4)" }}>
                            · {acc.followersCount.toLocaleString()}
                          </span>
                        )}
                        <button onClick={() => handleDeleteAccount(acc.id)}
                          className="ml-1 rounded" style={{ color: "rgba(240,238,255,0.3)" }}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="rounded-xl p-3 space-y-3" style={GLASS.inner}>
                  <p className="text-xs" style={{ color: "rgba(240,238,255,0.55)" }}>
                    Threadsプロフィールや投稿のURLを貼り付けてください。1枠に1URL。
                  </p>
                  <UrlInputList urls={bulkUrls} onChange={setBulkUrls} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleBulkAdd(false)}
                      disabled={bulkSubmitting || bulkUrls.every((u) => u.trim() === "")}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50"
                      style={GLASS.btnPrimary}
                    >
                      {bulkSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      このグループに追加
                    </button>
                    <button
                      onClick={() => handleBulkAdd(true)}
                      disabled={bulkSubmitting || isRunning || bulkUrls.every((u) => u.trim() === "")}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50"
                      style={{
                        background: "linear-gradient(135deg, rgba(251,191,36,0.5), rgba(245,158,11,0.35))",
                        border: "1px solid rgba(251,191,36,0.5)",
                        color: "#fef3c7",
                      }}
                    >
                      <Play className="h-3.5 w-3.5" />
                      追加してリサーチ開始
                    </button>
                    {bulkResult && (
                      <span className="text-xs" style={{ color: "rgba(240,238,255,0.55)" }}>
                        追加 {bulkResult.added} / 重複 {bulkResult.skipped}
                        {bulkResult.invalid > 0 && (
                          <span style={{ color: "#f87171" }}> / 無効URL {bulkResult.invalid}</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* アクション */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing || isRunning || accounts.length === 0}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:opacity-50"
                  style={GLASS.btnPrimary}
                >
                  {analyzing || isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {isRunning ? "分析中..." : "一括分析を開始"}
                </button>
                <div className="flex items-center gap-1.5 rounded-xl px-3 py-1" style={GLASS.inner}>
                  <label className="text-[11px] whitespace-nowrap" style={{ color: "rgba(240,238,255,0.55)" }}>
                    抽出件数/人
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    inputMode="numeric"
                    value={monitorLimit}
                    onChange={(e) => setMonitorLimit(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-16 rounded px-2 py-1 text-xs outline-none"
                    style={GLASS.input}
                  />
                </div>
                <button
                  onClick={handleMonitor}
                  disabled={monitoring || accounts.length === 0 || !!monitorJobId}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:opacity-50"
                  style={GLASS.btnSecondary}
                  title="詳細ページを1件ずつ訪問してエンゲージメント値を正確に取得（人間的速度で抽出）"
                >
                  {monitoring || monitorJobId ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {monitorJobId ? "抽出中..." : "投稿を収集"}
                </button>
                <Link href={`/threads-analysis/${group.id}/monitor`}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all"
                  style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24" }}>
                  <Activity className="h-4 w-4" />推移グラフ
                </Link>
                <Link href={`/threads-analysis/${group.id}/growth`}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all"
                  style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.25)", color: "#c4b5fd" }}>
                  <TrendingUp className="h-4 w-4" />成長分析
                </Link>
                <Link href="/posts/new"
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ml-auto"
                  style={GLASS.btnGhost}>
                  <Plus className="h-4 w-4" />新規投稿作成へ
                </Link>
              </div>

              {/* 抽出ジョブ進捗 */}
              {monitorJobId && <MonitorProgress status={monitorStatus} />}

              {/* 一括分析ジョブの進捗表示 */}
              {analyzeJobId && (
                <div className="rounded-xl p-3 space-y-2" style={GLASS.inner}>
                  {(() => {
                    const p = analyzeStatus?.progress;
                    const isObj = p && typeof p === "object";
                    const state = analyzeStatus?.state ?? "waiting";
                    const stateLabel =
                      state === "completed" ? "完了"
                      : state === "failed" ? "失敗"
                      : state === "active" ? "実行中"
                      : state === "waiting" ? "待機中"
                      : state;
                    const stateColor =
                      state === "completed" ? "#4ade80"
                      : state === "failed" ? "#f87171"
                      : state === "active" ? "#60a5fa"
                      : "#fbbf24";
                    const processed = (isObj && "processed" in p && typeof (p as Record<string, unknown>).processed === "number") ? (p as { processed: number }).processed : 0;
                    const target = (isObj && "target" in p && typeof (p as Record<string, unknown>).target === "number") ? (p as { target: number }).target : 30;
                    const matched = (isObj && "matched" in p && typeof (p as Record<string, unknown>).matched === "number") ? (p as { matched: number }).matched : 0;
                    const currentAccount = (isObj && "currentAccount" in p && typeof (p as Record<string, unknown>).currentAccount === "string") ? (p as { currentAccount: string }).currentAccount : null;
                    const message = (isObj && "message" in p && typeof (p as Record<string, unknown>).message === "string") ? (p as { message: string }).message : "ジョブ起動中...";
                    const pct = target > 0 ? Math.min(100, Math.round((processed / target) * 100)) : 0;
                    return (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Activity className="h-3.5 w-3.5 animate-pulse" style={{ color: stateColor }} />
                          <span className="text-xs font-semibold" style={{ color: stateColor }}>
                            一括分析ジョブ — {stateLabel}
                          </span>
                          {currentAccount && (
                            <span className="text-[10px]" style={{ color: "#c4b5fd" }}>
                              @{currentAccount}
                            </span>
                          )}
                          <span className="ml-auto text-[10px]" style={{ color: "rgba(240,238,255,0.5)" }}>
                            合致 {matched} 件
                          </span>
                        </div>
                        <p className="text-xs" style={{ color: "rgba(240,238,255,0.75)" }}>{message}</p>
                        <div>
                          <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: "rgba(240,238,255,0.5)" }}>
                            <span>処理 {processed}/{target}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(139,92,246,0.12)" }}>
                            <div className="h-full transition-all duration-500" style={{
                              width: `${pct}%`,
                              background: "linear-gradient(90deg, #a78bfa, #f0abfc)",
                            }} />
                          </div>
                        </div>
                        {state === "failed" && analyzeStatus?.failedReason && (
                          <p className="text-[10px] rounded p-2" style={{ color: "#f87171", background: "rgba(239,68,68,0.08)" }}>
                            {analyzeStatus.failedReason}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* フィルター */}
              <FilterBar filter={filter} onChange={setFilter} onReset={() => setFilter(EMPTY_FILTER)} />

              {/* 分析サマリー */}
              {profile?.status === "completed" && profile.profileJson && (
                <ProfileSummary profile={profile} />
              )}

              {/* バズ投稿一覧 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-3.5 w-3.5" style={{ color: "#a78bfa" }} />
                  <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>
                    バズ投稿一覧（フィルター適用結果 {posts.length} 件）
                  </p>
                  {postsLoading && <Loader2 className="h-3 w-3 animate-spin" style={{ color: "#a78bfa" }} />}
                  {copyNotice && (
                    <span className="ml-auto text-[10px]" style={{ color: "#4ade80" }}>
                      <Check className="inline h-3 w-3 mr-0.5" />クリップボードにコピーしました
                    </span>
                  )}
                </div>
                {posts.length === 0 ? (
                  <p className="text-xs rounded-lg p-4 text-center" style={{ color: "rgba(240,238,255,0.35)", ...GLASS.inner }}>
                    該当する投稿がありません。フィルターを緩めるか「投稿を収集」を実行してください。
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {posts.map((p) => <PostCard key={p.id} post={p} onCopy={handleCopy} />)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── アフィリエイトリンク保存ユーティリティ ──────────────────
interface SavedLink { url: string; label: string; }
const LS_LINK_KEY = "ig_story_affiliate_links";
function loadSavedLinks(): SavedLink[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LS_LINK_KEY) ?? "[]") as SavedLink[]; } catch { return []; }
}
function persistSavedLinks(links: SavedLink[]) { localStorage.setItem(LS_LINK_KEY, JSON.stringify(links)); }

// ─── メインページ ───────────────────────────────────────
export default function ThreadsAnalysisPage() {
  // ── タブ ──
  const [activeTab, setActiveTab] = useState<"analysis" | "threads" | "ig">("analysis");

  // ── 分析タブ ──
  const [groups, setGroups] = useState<ApiAdultGenre[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [initialUrls, setInitialUrls] = useState<string[]>([""]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Threads投稿タブ ──
  const [thAccounts, setThAccounts] = useState<ApiAccount[]>([]);
  const [thAccountId, setThAccountId] = useState("");
  const [thContent, setThContent] = useState("");
  const [thLinkUrl, setThLinkUrl] = useState("");
  const [thPosting, setThPosting] = useState(false);
  const [thResult, setThResult] = useState<"success" | "error" | null>(null);
  const [thError, setThError] = useState<string | null>(null);

  // ── 自動投稿（バズ投稿一括スケジュール）セクション ──
  const [autoPostGroupIds, setAutoPostGroupIds] = useState<string[]>([]);
  const [autoPostFilter, setAutoPostFilter] = useState<EngagementFilter>(EMPTY_FILTER);
  const [autoPostSelectedAccountIds, setAutoPostSelectedAccountIds] = useState<string[]>([]);
  const [autoPostInterval, setAutoPostInterval] = useState<string>("60");
  const [autoPostMaxCount, setAutoPostMaxCount] = useState<string>("10");
  const [autoPostIncludeImages, setAutoPostIncludeImages] = useState<boolean>(false);
  const [autoPostSubmitting, setAutoPostSubmitting] = useState(false);
  const [autoPostMessage, setAutoPostMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [autoPostPostIds, setAutoPostPostIds] = useState<string[]>([]);
  const [autoPostStatus, setAutoPostStatus] = useState<AutoPostStatusResult | null>(null);

  // ── Instagramストーリー投稿タブ（フォルダ起点・フィード/ストーリー両対応） ──
  const [igAccounts, setIgAccounts] = useState<ApiAccount[]>([]);
  const [igAccountId, setIgAccountId] = useState("");
  const [igAccountName, setIgAccountName] = useState("");
  const [igPending, setIgPending] = useState<InstagramPendingImage[]>([]);
  const [igPendingLoading, setIgPendingLoading] = useState(false);
  const [igPendingError, setIgPendingError] = useState<string | null>(null);
  const [igSelectedFiles, setIgSelectedFiles] = useState<Set<string>>(new Set());
  const [igModes, setIgModes] = useState<("feed" | "story")[]>(["feed", "story"]);
  const [igIntervalSec, setIgIntervalSec] = useState<number>(60);
  const [igCaptionOverride, setIgCaptionOverride] = useState("");
  const [igAffiliateUrlOverride, setIgAffiliateUrlOverride] = useState("");
  const [igAffiliateLabelOverride, setIgAffiliateLabelOverride] = useState("");
  const [igSubmitting, setIgSubmitting] = useState(false);
  const [igSubmitResult, setIgSubmitResult] = useState<"success" | "error" | null>(null);
  const [igSubmitMessage, setIgSubmitMessage] = useState<string | null>(null);
  const [igSavedLinks, setIgSavedLinks] = useState<SavedLink[]>([]);
  const [igNewLinkUrl, setIgNewLinkUrl] = useState("");
  const [igNewLinkLabel, setIgNewLinkLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdultGenres();
      setGroups(data);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreateError(null);
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError("グループ名を入力してください");
      return;
    }
    if (trimmedName.length > 100) {
      setCreateError(`グループ名は100文字以内にしてください（現在 ${trimmedName.length} 文字）`);
      return;
    }

    const filledUrls = initialUrls.map((u) => u.trim()).filter((u) => u.length > 0);
    const extracted: string[] = [];
    let invalid = 0;
    for (const u of filledUrls) {
      const name = extractUsernameFromInput(u);
      if (name) extracted.push(name);
      else invalid++;
    }
    const uniqueUsernames = [...new Set(extracted)];

    if (invalid > 0) {
      const ok = confirm(`${invalid}件のURLが認識できませんでした。無視して作成しますか？`);
      if (!ok) return;
    }

    setCreating(true);
    try {
      const g = await createAdultGenre({
        name: trimmedName,
        description: newDesc.trim() || undefined,
      });
      if (uniqueUsernames.length > 0) {
        try {
          await bulkAddReferenceAccounts(g.id, { usernames: uniqueUsernames });
        } catch (bulkErr) {
          setCreateError(
            `グループは作成されましたが、初期アカウントの追加に失敗しました: ${
              bulkErr instanceof Error ? bulkErr.message : String(bulkErr)
            }`,
          );
          await load();
          return;
        }
      }
      setNewName("");
      setNewDesc("");
      setInitialUrls([""]);
      setShowForm(false);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCreateError(`作成失敗: ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdated = (updated: ApiAdultGenre) => {
    setGroups((prev) => prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g)));
  };

  // ── Threads/IG タブ初期化 ──
  useEffect(() => {
    getAccounts().then((list) => {
      setThAccounts(list.filter((a) => a.platform === "threads"));
      const igList = list.filter((a) => a.platform === "instagram");
      setIgAccounts(igList);
      if (igList.length > 0) {
        setIgAccountId(igList[0].id);
        setIgAccountName(igList[0].username);
      }
      const thList = list.filter((a) => a.platform === "threads");
      if (thList.length > 0) setThAccountId(thList[0].id);
    }).catch(() => {});
    setIgSavedLinks(loadSavedLinks());
  }, []);

  const fetchIgPending = useCallback(() => {
    if (!igAccountName) {
      setIgPending([]);
      setIgSelectedFiles(new Set());
      return;
    }
    setIgPendingLoading(true);
    setIgPendingError(null);
    getInstagramPendingImages(igAccountName)
      .then((data) => {
        setIgPending(data.images);
        setIgSelectedFiles(new Set(data.images.map((i) => i.filename)));
      })
      .catch((e) => setIgPendingError(e instanceof Error ? e.message : "取得失敗"))
      .finally(() => setIgPendingLoading(false));
  }, [igAccountName]);

  useEffect(() => {
    if (activeTab === "ig") fetchIgPending();
  }, [activeTab, fetchIgPending]);

  const toggleIgFile = (filename: string) => {
    setIgSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const toggleIgMode = (mode: "feed" | "story") => {
    setIgModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]));
  };

  const toggleAutoPostAccountId = (id: string) => {
    setAutoPostSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleAutoPostGroupId = (id: string) => {
    setAutoPostGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleQueueAutoPost = async () => {
    setAutoPostMessage(null);
    if (autoPostGroupIds.length === 0) {
      setAutoPostMessage({ kind: "err", text: "グループを1件以上選択してください" });
      return;
    }
    const maxPosts = parseInt(autoPostMaxCount);
    const interval = parseInt(autoPostInterval);
    if (autoPostSelectedAccountIds.length === 0) {
      setAutoPostMessage({ kind: "err", text: "投稿先アカウントを1件以上選択してください" });
      return;
    }
    if (!Number.isFinite(maxPosts) || maxPosts < 1 || maxPosts > 100) {
      setAutoPostMessage({ kind: "err", text: "件数は 1〜100 で指定してください" });
      return;
    }
    if (!Number.isFinite(interval) || interval < 1 || interval > 1440) {
      setAutoPostMessage({ kind: "err", text: "間隔は 1〜1440 分で指定してください" });
      return;
    }

    setAutoPostSubmitting(true);
    try {
      const num = (v: string): number | undefined => {
        if (v === "") return undefined;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      };
      const filterPayload = {
        minLikes: num(autoPostFilter.minLikes),
        maxLikes: num(autoPostFilter.maxLikes),
        minReplies: num(autoPostFilter.minReplies),
        maxReplies: num(autoPostFilter.maxReplies),
        minViews: num(autoPostFilter.minViews),
        maxViews: num(autoPostFilter.maxViews),
        minReposts: num(autoPostFilter.minReposts),
        maxReposts: num(autoPostFilter.maxReposts),
      };

      const res = await startResearchAutoPostMulti({
        genreIds: autoPostGroupIds,
        accountIds: autoPostSelectedAccountIds,
        intervalMinutes: interval,
        maxPosts,
        orderBy: "views",
        filter: filterPayload,
        includeImagePosts: autoPostIncludeImages,
      });
      const usernames = thAccounts
        .filter((a) => autoPostSelectedAccountIds.includes(a.id))
        .map((a) => `@${a.username}`)
        .join(", ");
      const groupNames = groups
        .filter((g) => autoPostGroupIds.includes(g.id))
        .map((g) => g.name)
        .join(", ");
      setAutoPostMessage({
        kind: "ok",
        text: `[${groupNames}] から ${usernames} に ${res.scheduledCount} 件をインプレッション順で予約しました`,
      });
      if (res.posts && res.posts.length > 0) {
        setAutoPostPostIds(res.posts.map((p) => p.postId));
        setAutoPostStatus(null);
      }
    } catch (err) {
      setAutoPostMessage({ kind: "err", text: `予約失敗: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setAutoPostSubmitting(false);
    }
  };

  // 自動投稿進捗ポーリング
  useEffect(() => {
    if (autoPostPostIds.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const stats = await getAutoPostStatusMulti(autoPostPostIds);
        if (!cancelled) setAutoPostStatus(stats);
      } catch { /* noop */ }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [autoPostPostIds]);

  const handleThreadsPost = async (e: React.FormEvent, asDraft: boolean) => {
    e.preventDefault();
    if (!thContent.trim() || !thAccountId) return;
    setThPosting(true);
    setThResult(null);
    setThError(null);
    try {
      await createPost({
        accountId: thAccountId,
        platform: "threads",
        contentText: thContent.trim(),
        linkUrl: thLinkUrl.trim() || undefined,
        status: asDraft ? "draft" : "scheduled",
      });
      setThResult("success");
      setThContent("");
      setThLinkUrl("");
    } catch (err) {
      setThResult("error");
      setThError(err instanceof Error ? err.message : "投稿失敗");
    } finally {
      setThPosting(false);
    }
  };

  const handleIgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!igAccountName) {
      setIgSubmitResult("error");
      setIgSubmitMessage("アカウントを選択してください");
      return;
    }
    if (igSelectedFiles.size === 0) {
      setIgSubmitResult("error");
      setIgSubmitMessage("画像が選択されていません");
      return;
    }
    if (igModes.length === 0) {
      setIgSubmitResult("error");
      setIgSubmitMessage("投稿先（フィード／ストーリー）を1つ以上選択してください");
      return;
    }
    setIgSubmitting(true);
    setIgSubmitResult(null);
    setIgSubmitMessage(null);
    try {
      const result = await postInstagramFromFolder({
        account: igAccountName,
        filenames: Array.from(igSelectedFiles),
        modes: igModes,
        intervalSec: igIntervalSec,
        captionOverride: igCaptionOverride.trim() || undefined,
        affiliateUrlOverride: igAffiliateUrlOverride.trim() || undefined,
        affiliateLabelOverride: igAffiliateLabelOverride.trim() || undefined,
      });
      setIgSubmitResult("success");
      setIgSubmitMessage(`${result.count}件をキューに投入しました（間隔 ${result.intervalSec}秒）`);
      fetchIgPending();
    } catch (err) {
      setIgSubmitResult("error");
      setIgSubmitMessage(err instanceof Error ? err.message : "投稿に失敗しました");
    } finally {
      setIgSubmitting(false);
    }
  };

  const handleAddIgLink = () => {
    if (!igNewLinkUrl.trim()) return;
    const next: SavedLink[] = [...igSavedLinks, { url: igNewLinkUrl.trim(), label: igNewLinkLabel.trim() || igNewLinkUrl.trim() }];
    setIgSavedLinks(next);
    persistSavedLinks(next);
    setIgNewLinkUrl("");
    setIgNewLinkLabel("");
  };

  const handleDeleteIgLink = (i: number) => {
    const next = igSavedLinks.filter((_, idx) => idx !== i);
    setIgSavedLinks(next);
    persistSavedLinks(next);
  };

  const TABS = [
    { id: "analysis" as const, label: "Threadsアカウント分析" },
    { id: "threads" as const, label: "Threads投稿" },
    { id: "ig" as const, label: "Instagramストーリー投稿" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0a0819 0%, #0d0a1e 100%)" }}>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* タブナビ */}
        <div className="flex gap-1 rounded-xl p-1" style={{ background: "rgba(15,12,30,0.7)", border: "1px solid rgba(139,92,246,0.15)" }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all"
              style={activeTab === tab.id ? {
                background: "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(168,85,247,0.4))",
                border: "1px solid rgba(139,92,246,0.5)",
                color: "#e9d5ff",
              } : {
                color: "rgba(240,238,255,0.45)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === "analysis" && (<>
        {/* ヘッダー */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" style={{
              background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              Threadsアカウント分析
            </h1>
            <p className="text-sm mt-1" style={{ color: "rgba(240,238,255,0.55)" }}>
              Threadsアカウントをグループ化して一括分析。バズ投稿抽出 → 共通要因特定 → 自分の投稿へ転用。
            </p>
            <p className="text-xs mt-1" style={{ color: "rgba(240,238,255,0.35)" }}>
              1アカウントからでも分析可能。アカウント数の上限なし。
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all"
            style={GLASS.btnPrimary}
          >
            <Plus className="h-4 w-4" />
            新しいグループを作成
          </button>
        </div>

        {/* スクレイパーエンジン切替 — Threadsデータ収集の挙動に直結 */}
        <ScraperEngineToggle />

        {/* 作成フォーム */}
        {showForm && (
          <div className="rounded-2xl p-5 space-y-3" style={GLASS.card}>
            {createError && (
              <div
                className="rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "rgba(244,63,94,0.12)",
                  border: "1px solid rgba(244,63,94,0.4)",
                  color: "#fda4af",
                }}
              >
                {createError}
              </div>
            )}
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="グループ名（例: 恋愛系トップクリエイター）"
              maxLength={100}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={GLASS.input}
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="説明（任意）"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={GLASS.input}
            />
            <div className="space-y-2">
              <p className="text-xs" style={{ color: "rgba(240,238,255,0.55)" }}>
                初期アカウント（任意・後から追加可）— ThreadsプロフィールのURLを貼り付け、1枠に1URL
              </p>
              <UrlInputList urls={initialUrls} onChange={setInitialUrls} />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:opacity-50"
                style={GLASS.btnPrimary}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                作成
              </button>
              <button
                onClick={() => { setShowForm(false); setCreateError(null); }}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-all"
                style={GLASS.btnGhost}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* グループ一覧 */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#a78bfa" }} />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={GLASS.card}>
            <Layers className="h-10 w-10 mx-auto mb-3" style={{ color: "rgba(139,92,246,0.3)" }} />
            <p className="text-sm" style={{ color: "rgba(240,238,255,0.5)" }}>
              まだグループがありません。「新しいグループを作成」から始めてください。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                onDeleted={load}
                onUpdated={handleUpdated}
              />
            ))}
          </div>
        )}
        </>)}

        {/* ─── Threads投稿タブ ─── */}
        {activeTab === "threads" && (
          <div className="space-y-6">
            {/* ─── 自動投稿（バズ投稿一括スケジュール） ─── */}
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold" style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  自動投稿（バズ投稿一括スケジュール）
                </h2>
                <p className="text-sm mt-1" style={{ color: "rgba(240,238,255,0.45)" }}>
                  Threadsアカウント分析タブで作成したグループから、エンゲージメント条件に合うバズ投稿を抽出し、選択アカウントへインプレッション順に順次予約します。
                </p>
              </div>

              <div
                className="rounded-2xl p-4 space-y-3"
                style={{
                  background: "rgba(34,197,94,0.06)",
                  border: "1px solid rgba(34,197,94,0.2)",
                }}
              >
                {/* グループ選択（複数選択可） */}
                <div className="space-y-1.5">
                  <label className="text-[11px]" style={{ color: "rgba(240,238,255,0.6)" }}>
                    対象グループ（複数選択可・収集投稿を横断ランキング）
                  </label>
                  {groups.length === 0 ? (
                    <p className="text-xs" style={{ color: "rgba(240,238,255,0.4)" }}>
                      グループがありません。「Threadsアカウント分析」タブで先に作成してください。
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {groups.map((g) => {
                        const selected = autoPostGroupIds.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => toggleAutoPostGroupId(g.id)}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                            style={{
                              background: selected ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.04)",
                              border: `1px solid ${selected ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)"}`,
                              color: selected ? "#c4b5fd" : "rgba(240,238,255,0.5)",
                            }}
                          >
                            {selected && <Check className="h-3 w-3" />}
                            {g.name}{g.accountCount ? ` (${g.accountCount})` : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* エンゲージメントフィルタ */}
                <FilterBar
                  filter={autoPostFilter}
                  onChange={setAutoPostFilter}
                  onReset={() => setAutoPostFilter(EMPTY_FILTER)}
                />

                {/* アカウント複数選択 */}
                <div className="space-y-1.5">
                  <label className="text-[11px]" style={{ color: "rgba(240,238,255,0.6)" }}>
                    投稿先アカウント（複数選択可・Threads / active）
                  </label>
                  {thAccounts.filter((a) => a.status === "active").length === 0 ? (
                    <p className="text-xs" style={{ color: "rgba(240,238,255,0.4)" }}>
                      対象アカウントがありません
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {thAccounts.filter((a) => a.status === "active").map((a) => {
                        const selected = autoPostSelectedAccountIds.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleAutoPostAccountId(a.id)}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                            style={{
                              background: selected ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.04)",
                              border: `1px solid ${selected ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.1)"}`,
                              color: selected ? "#4ade80" : "rgba(240,238,255,0.5)",
                            }}
                          >
                            {selected && <Check className="h-3 w-3" />}
                            @{a.username}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] flex items-center gap-1" style={{ color: "rgba(240,238,255,0.6)" }}>
                      <Clock className="h-3 w-3" />投稿間隔（分・1〜1440）
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={autoPostInterval}
                      onChange={(e) => setAutoPostInterval(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={GLASS.input}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] flex items-center gap-1" style={{ color: "rgba(240,238,255,0.6)" }}>
                      <Trophy className="h-3 w-3" />最大投稿数（1〜100）
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={autoPostMaxCount}
                      onChange={(e) => setAutoPostMaxCount(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={GLASS.input}
                    />
                  </div>
                </div>

                {/* 画像付き投稿トグル */}
                <button
                  type="button"
                  onClick={() => setAutoPostIncludeImages((v) => !v)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 w-full transition-all"
                  style={{
                    background: autoPostIncludeImages ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${autoPostIncludeImages ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  <span className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-all"
                    style={{ background: autoPostIncludeImages ? "#22c55e" : "rgba(255,255,255,0.15)" }}>
                    <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
                      style={{
                        transform: autoPostIncludeImages ? "translateX(18px)" : "translateX(2px)",
                        marginTop: "2px",
                      }}
                    />
                  </span>
                  <ImageIcon className="h-3.5 w-3.5" style={{ color: autoPostIncludeImages ? "#4ade80" : "rgba(240,238,255,0.5)" }} />
                  <div className="flex-1 text-left">
                    <p className="text-xs font-medium" style={{ color: autoPostIncludeImages ? "#4ade80" : "rgba(240,238,255,0.7)" }}>
                      画像付き投稿も対象に含める
                    </p>
                    <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>
                      {autoPostIncludeImages
                        ? "ON: バズ投稿の画像付き投稿（テキスト+画像）も自動投稿対象"
                        : "OFF: テキストのみの投稿だけが対象"}
                    </p>
                  </div>
                </button>

                {autoPostMessage && (
                  <div
                    className="rounded-lg px-3 py-2 text-xs"
                    style={
                      autoPostMessage.kind === "ok"
                        ? { background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)", color: "#86efac" }
                        : { background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.4)", color: "#fda4af" }
                    }
                  >
                    {autoPostMessage.text}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleQueueAutoPost}
                  disabled={autoPostSubmitting || autoPostGroupIds.length === 0 || autoPostSelectedAccountIds.length === 0}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, #16a34a, #22c55e)",
                    color: "#fff",
                    boxShadow: "0 0 18px rgba(34,197,94,0.3)",
                  }}
                >
                  {autoPostSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  自動投稿スケジュールを登録
                </button>

                {/* 進捗パネル */}
                {autoPostStatus && autoPostStatus.total > 0 && (() => {
                  const s = autoPostStatus;
                  const allDone = s.processing === 0 && s.pending === 0;
                  const headerLabel = allDone
                    ? (s.failed > 0 ? "実行完了（一部失敗あり）" : "実行完了")
                    : "実行中";
                  const headerColor = allDone
                    ? (s.failed > 0 ? "#fbbf24" : "#4ade80")
                    : "#60a5fa";
                  const pct = s.total > 0 ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;
                  return (
                    <div className="rounded-xl p-3 space-y-2 mt-3"
                      style={{ background: "rgba(15,12,30,0.5)", border: "1px solid rgba(34,197,94,0.2)" }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Activity className={`h-3.5 w-3.5 ${allDone ? "" : "animate-pulse"}`} style={{ color: headerColor }} />
                        <span className="text-xs font-semibold" style={{ color: headerColor }}>
                          自動投稿バッチ — {headerLabel}
                        </span>
                        <span className="ml-auto text-[10px]" style={{ color: "rgba(240,238,255,0.5)" }}>
                          完了 {s.done}/{s.total} 件
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: "rgba(240,238,255,0.5)" }}>
                          <span>
                            投稿済 {s.done} / 失敗 {s.failed} / 実行中 {s.processing} / 待機 {s.pending}
                          </span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(139,92,246,0.12)" }}>
                          <div className="h-full transition-all duration-500" style={{
                            width: `${pct}%`,
                            background: allDone && s.failed === 0
                              ? "linear-gradient(90deg, #22c55e, #4ade80)"
                              : "linear-gradient(90deg, #60a5fa, #a78bfa)",
                          }} />
                        </div>
                      </div>
                      {s.items.length > 0 && (
                        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                          {s.items.slice(0, 10).map((it: AutoPostStatusResult["items"][number]) => {
                            const stColor =
                              it.status === "done" ? "#4ade80"
                              : it.status === "failed" ? "#f87171"
                              : it.status === "processing" ? "#60a5fa"
                              : "rgba(240,238,255,0.4)";
                            const stLabel =
                              it.status === "done" ? "完了"
                              : it.status === "failed" ? "失敗"
                              : it.status === "processing" ? "実行中"
                              : "待機";
                            return (
                              <div key={it.postId} className="flex items-center gap-2 text-[11px] rounded p-1.5"
                                style={{ background: "rgba(255,255,255,0.02)" }}>
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0"
                                  style={{ background: `${stColor}20`, color: stColor, border: `1px solid ${stColor}40` }}>
                                  {stLabel}
                                </span>
                                <span className="shrink-0" style={{ color: "rgba(240,238,255,0.4)" }}>
                                  @{it.accountUsername ?? "-"}
                                </span>
                                <span className="truncate flex-1" style={{ color: "rgba(240,238,255,0.7)" }}>
                                  {it.contentPreview}
                                </span>
                                {it.scheduledAt && (
                                  <span className="shrink-0" style={{ color: "rgba(240,238,255,0.35)" }}>
                                    {new Date(it.scheduledAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ─── 直接投稿（手動） ─── */}
            <div className="space-y-4 pt-2">
              <div>
                <h2 className="text-xl font-bold" style={{ background: "linear-gradient(135deg, #c4b5fd, #f0abfc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  Threads投稿
                </h2>
                <p className="text-sm mt-1" style={{ color: "rgba(240,238,255,0.45)" }}>Threadsに直接投稿します（下書き保存→後で自動投稿）</p>
              </div>
              <form onSubmit={(e) => handleThreadsPost(e, false)} className="space-y-4">
                {/* アカウント選択 */}
                <div className="rounded-2xl p-4 space-y-2" style={GLASS.card}>
                  <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>アカウント</p>
                  {thAccounts.length === 0 ? (
                    <p className="text-sm" style={{ color: "rgba(240,238,255,0.45)" }}>Threadsアカウントが登録されていません</p>
                  ) : (
                    <select value={thAccountId} onChange={(e) => setThAccountId(e.target.value)} className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={GLASS.input}>
                      {thAccounts.map((a) => (
                        <option key={a.id} value={a.id}>@{a.username}{a.displayName ? ` (${a.displayName})` : ""}</option>
                      ))}
                    </select>
                  )}
                </div>
                {/* 本文 */}
                <div className="rounded-2xl p-4 space-y-2" style={GLASS.card}>
                  <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>投稿テキスト</p>
                  <textarea
                    value={thContent}
                    onChange={(e) => setThContent(e.target.value)}
                    rows={5}
                    placeholder="投稿内容を入力..."
                    className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
                    style={GLASS.input}
                  />
                  <p className="text-xs text-right" style={{ color: "rgba(240,238,255,0.3)" }}>{thContent.length} 文字</p>
                </div>
                {/* リンク */}
                <div className="rounded-2xl p-4 space-y-2" style={GLASS.card}>
                  <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>リンクURL（任意）</p>
                  <input type="url" value={thLinkUrl} onChange={(e) => setThLinkUrl(e.target.value)} placeholder="https://..." className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={GLASS.input} />
                </div>
                {/* 送信ボタン: 予約投稿 + 下書き */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="submit"
                    disabled={thPosting || !thContent.trim() || !thAccountId}
                    className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all disabled:opacity-50"
                    style={GLASS.btnPrimary}
                  >
                    {thPosting ? <><Loader2 className="h-4 w-4 animate-spin" />投稿中...</> : <><Send className="h-4 w-4" />予約投稿として作成</>}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleThreadsPost(e as unknown as React.FormEvent, true)}
                    disabled={thPosting || !thContent.trim() || !thAccountId}
                    className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all disabled:opacity-50"
                    style={GLASS.btnGhost}
                  >
                    下書き保存
                  </button>
                </div>
                {thResult === "success" && (
                  <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>保存しました</div>
                )}
                {thResult === "error" && (
                  <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.25)", color: "#fb7185" }}>{thError}</div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* ─── Instagramストーリー投稿タブ（フォルダ起点・フィード/ストーリー両対応） ─── */}
        {activeTab === "ig" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold" style={{ background: "linear-gradient(135deg, #c4b5fd, #f0abfc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Instagramストーリー投稿
              </h2>
              <p className="text-sm mt-1" style={{ color: "rgba(240,238,255,0.45)" }}>
                pendingフォルダの画像を選択してフィード／ストーリーへ一括投稿します
              </p>
            </div>

            {/* 画像格納フォルダ案内 */}
            <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)" }}>
              <p className="text-xs font-bold" style={{ color: "#fbbf24" }}>📁 画像を格納するフォルダ（アカウント別）</p>
              <p className="text-xs font-mono break-all" style={{ color: "rgba(240,238,255,0.85)", background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: "8px" }}>
                ~/projects/sns-automation/apps/worker/data/instagram-uploads/{igAccountName || "<account>"}/pending/
              </p>
              <p className="text-xs" style={{ color: "rgba(240,238,255,0.5)" }}>
                対応形式: JPG / PNG / GIF / WebP。<br />
                同階層に <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 4px", borderRadius: "4px" }}>{`<filename>.meta.json`}</code> を置くと caption / affiliateUrl / affiliateLabel / platforms をファイル別に指定できます。<br />
                格納後「更新」ボタンで一覧に表示されます。
              </p>
            </div>

            <form onSubmit={handleIgSubmit} className="grid gap-5 lg:grid-cols-2">
              {/* 左: フォーム */}
              <div className="space-y-4">
                {/* アカウント */}
                <div className="rounded-2xl p-4 space-y-2" style={GLASS.card}>
                  <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>アカウント</p>
                  {igAccounts.length === 0 ? (
                    <input
                      value={igAccountName}
                      onChange={(e) => setIgAccountName(e.target.value)}
                      placeholder="例: natalia_r_29"
                      className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                      style={GLASS.input}
                    />
                  ) : (
                    <select
                      value={igAccountId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setIgAccountId(id);
                        const acc = igAccounts.find((a) => a.id === id);
                        if (acc) setIgAccountName(acc.username);
                      }}
                      className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                      style={GLASS.input}
                    >
                      {igAccounts.map((a) => (
                        <option key={a.id} value={a.id}>@{a.username}{a.displayName ? ` (${a.displayName})` : ""}</option>
                      ))}
                    </select>
                  )}
                  <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.35)" }}>フォルダ参照名: {igAccountName || "(未選択)"}</p>
                </div>

                {/* 投稿先（フィード／ストーリー） */}
                <div className="rounded-2xl p-4 space-y-2" style={GLASS.card}>
                  <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>投稿先</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm" style={{ color: "rgba(240,238,255,0.85)" }}>
                      <input type="checkbox" checked={igModes.includes("feed")} onChange={() => toggleIgMode("feed")} />
                      フィード
                    </label>
                    <label className="flex items-center gap-2 text-sm" style={{ color: "rgba(240,238,255,0.85)" }}>
                      <input type="checkbox" checked={igModes.includes("story")} onChange={() => toggleIgMode("story")} />
                      ストーリーズ
                    </label>
                  </div>
                  <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.35)" }}>両方選択すると同じ画像をフィード+ストーリーへ送信します</p>
                </div>

                {/* 投稿間隔 */}
                <div className="rounded-2xl p-4 space-y-2" style={GLASS.card}>
                  <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>投稿間隔（秒）</p>
                  <input
                    type="number"
                    min={0}
                    value={igIntervalSec}
                    onChange={(e) => setIgIntervalSec(parseInt(e.target.value || "0", 10))}
                    className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                    style={GLASS.input}
                  />
                </div>

                {/* キャプション一括上書き */}
                <div className="rounded-2xl p-4 space-y-2" style={GLASS.card}>
                  <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>キャプション一括上書き（任意）</p>
                  <textarea
                    value={igCaptionOverride}
                    onChange={(e) => setIgCaptionOverride(e.target.value)}
                    rows={2}
                    placeholder="空欄なら meta.json または Gemini 自動生成を使用"
                    className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
                    style={GLASS.input}
                  />
                </div>

                {/* アフィリエイトリンク一括上書き */}
                <div className="rounded-2xl p-4 space-y-3" style={GLASS.card}>
                  <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>アフィリエイトリンク一括上書き（任意）</p>
                  <input
                    type="url"
                    value={igAffiliateUrlOverride}
                    onChange={(e) => setIgAffiliateUrlOverride(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                    style={GLASS.input}
                  />
                  <input
                    type="text"
                    value={igAffiliateLabelOverride}
                    onChange={(e) => setIgAffiliateLabelOverride(e.target.value)}
                    placeholder="リンクテキスト（例: 詳しくはこちら）"
                    className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                    style={GLASS.input}
                  />
                  {/* 保存済みリンク */}
                  {igSavedLinks.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs" style={{ color: "rgba(240,238,255,0.35)" }}>保存済みリンク</p>
                      {igSavedLinks.map((link, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setIgAffiliateUrlOverride(link.url); setIgAffiliateLabelOverride(link.label); }}
                            className="flex flex-1 items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs"
                            style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "rgba(240,238,255,0.75)" }}
                          >
                            <Link2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">{link.label}</span>
                          </button>
                          <button type="button" onClick={() => handleDeleteIgLink(i)} className="rounded-lg p-1.5 hover:text-red-400" style={{ color: "rgba(240,238,255,0.35)" }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 新規リンク登録 */}
                  <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-xs" style={{ color: "rgba(240,238,255,0.35)" }}>リンクを保存</p>
                    <input type="url" value={igNewLinkUrl} onChange={(e) => setIgNewLinkUrl(e.target.value)} placeholder="URL" className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none" style={GLASS.input} />
                    <div className="flex gap-2">
                      <input type="text" value={igNewLinkLabel} onChange={(e) => setIgNewLinkLabel(e.target.value)} placeholder="表示名（任意）" className="flex-1 rounded-lg px-3 py-2 text-xs focus:outline-none" style={GLASS.input} />
                      <button type="button" onClick={handleAddIgLink} disabled={!igNewLinkUrl.trim()} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-40" style={GLASS.btnSecondary}>
                        <Plus className="h-3 w-3" />保存
                      </button>
                    </div>
                  </div>
                </div>

                {/* 送信ボタン */}
                <button
                  type="submit"
                  disabled={igSubmitting || igSelectedFiles.size === 0 || !igAccountName || igModes.length === 0}
                  className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all disabled:opacity-50"
                  style={GLASS.btnPrimary}
                >
                  {igSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />投稿中...</> : <><Send className="h-4 w-4" />投稿実行（{igSelectedFiles.size}件）</>}
                </button>
                {igSubmitResult === "success" && (
                  <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>
                    {igSubmitMessage ?? "投稿が完了しました"}
                  </div>
                )}
                {igSubmitResult === "error" && (
                  <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.25)", color: "#fb7185" }}>
                    {igSubmitMessage}
                  </div>
                )}
              </div>

              {/* 右: 画像選択 */}
              <div className="rounded-2xl p-4 space-y-3" style={GLASS.card}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold flex items-center gap-2" style={{ color: "#a78bfa" }}>
                    <ImageIcon className="h-3.5 w-3.5" />画像を選択（複数可）
                  </p>
                  <button type="button" onClick={fetchIgPending} className="rounded-lg p-1.5" style={{ color: "rgba(240,238,255,0.45)" }} title="更新">
                    <RefreshCw className={`h-4 w-4 ${igPendingLoading ? "animate-spin" : ""}`} />
                  </button>
                </div>
                <div className="text-xs flex items-center justify-between" style={{ color: "rgba(240,238,255,0.55)" }}>
                  <span>選択中: <span style={{ color: "#c4b5fd" }}>{igSelectedFiles.size}</span> / {igPending.length}</span>
                  {igPending.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIgSelectedFiles(new Set(igPending.map((p) => p.filename)))}
                        className="text-[10px] rounded px-2 py-0.5"
                        style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }}
                      >
                        全選択
                      </button>
                      <button
                        type="button"
                        onClick={() => setIgSelectedFiles(new Set())}
                        className="text-[10px] rounded px-2 py-0.5"
                        style={{ background: "rgba(255,255,255,0.06)", color: "rgba(240,238,255,0.55)" }}
                      >
                        解除
                      </button>
                    </div>
                  )}
                </div>
                {igPendingError && (
                  <p className="text-xs rounded-lg px-3 py-2" style={{ background: "rgba(244,63,94,0.1)", color: "#fb7185" }}>{igPendingError}</p>
                )}
                {igPendingLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#a78bfa" }} />
                  </div>
                ) : igPending.length === 0 ? (
                  <p className="text-xs text-center py-8" style={{ color: "rgba(240,238,255,0.35)" }}>
                    上記フォルダに画像を配置してから「更新」を押してください
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-[480px] overflow-y-auto pr-1">
                    {igPending.map((img) => {
                      const checked = igSelectedFiles.has(img.filename);
                      return (
                        <label
                          key={img.filename}
                          className="rounded-xl overflow-hidden border-2 transition-all text-left cursor-pointer block"
                          style={{
                            borderColor: checked ? "#a78bfa" : "transparent",
                            background: "rgba(255,255,255,0.03)",
                          }}
                        >
                          <div className="flex items-start gap-2 px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleIgFile(img.filename)}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <ImageIcon className="h-3 w-3 shrink-0" style={{ color: "#a78bfa" }} />
                                <span className="text-xs truncate" style={{ color: "rgba(240,238,255,0.75)" }}>{img.filename}</span>
                              </div>
                              <p className="text-[10px] mt-0.5" style={{ color: "rgba(240,238,255,0.35)" }}>
                                {(img.size / 1024).toFixed(0)} KB
                                {img.meta && (
                                  <span className="ml-1 px-1 rounded" style={{ background: "rgba(34,197,94,0.2)", color: "#86efac" }}>meta</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
