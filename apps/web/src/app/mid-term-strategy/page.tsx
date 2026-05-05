"use client";

import { useState, useEffect } from "react";
import { TrendingUp, CheckCircle2, Circle, ChevronDown, ChevronRight, ArrowRight, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { IgStrategyContent } from "../ig-strategy/page";

// ─── 型定義 ─────────────────────────────────────────────────

type Responsible = "開発" | "ユーザー" | "自動";

interface Phase {
  id: number;
  label: string;
  period: string;
  description: string;
  startDate: Date;
  endDate: Date;
}

interface RevenueRow {
  month: string;
  accounts: string;
  cv: string;
  revenue: string;
  note: string;
}

interface KpiRow {
  metric: string;
  target: string;
}

interface ScheduleRow {
  date: string;
  task: string;
  responsible: Responsible;
}

interface CheckItem {
  id: string;
  label: string;
}

interface FunnelRow {
  step: string;
  rate: string;
  value: string;
  isHighlight?: boolean;
}

// ─── データ ──────────────────────────────────────────────────

const FLOW_STEPS = [
  { emoji: "📝", label: "Threads投稿" },
  { emoji: "👤", label: "プロフィール閲覧・エンゲージメント" },
  { emoji: "📱", label: "Instagramストーリー閲覧" },
  { emoji: "🔗", label: "LP誘導\n(アフィリエイトリンク)" },
  { emoji: "✅", label: "CV\n(アプリDL/LINE登録)" },
];

const FUNNEL_ROWS: FunnelRow[] = [
  { step: "Threadsインプレッション", rate: "基準",   value: "1,400,000" },
  { step: "Instagram遷移",           rate: "×0.7%",  value: "9,800人" },
  { step: "ストーリー閲覧",          rate: "×100%",  value: "9,800人" },
  { step: "LPクリック",              rate: "×10%",   value: "980人" },
  { step: "CV（2.7%）",              rate: "×2.7%",  value: "約26件" },
  { step: "月間収益（×¥500）",       rate: "—",      value: "約¥13,000", isHighlight: true },
];

const PHASES: Phase[] = [
  { id: 1, label: "Phase 1", period: "4/28〜5/2",  description: "実装完了",               startDate: new Date("2026-04-28"), endDate: new Date("2026-05-02") },
  { id: 2, label: "Phase 2", period: "5/3〜5/16",  description: "Natalia単独検証",         startDate: new Date("2026-05-03"), endDate: new Date("2026-05-16") },
  { id: 3, label: "Phase 3", period: "5/17〜5/31", description: "5アカウント拡張",         startDate: new Date("2026-05-17"), endDate: new Date("2026-05-31") },
  { id: 4, label: "Phase 4", period: "6月〜",       description: "30〜50アカウントスケール", startDate: new Date("2026-06-01"), endDate: new Date("2026-08-31") },
];

const REVENUE_ROWS: RevenueRow[] = [
  { month: "5月（検証）", accounts: "1〜3",   cv: "26〜78件",       revenue: "¥13,000〜39,000",   note: "Natalia単体から開始" },
  { month: "6月",         accounts: "10〜20", cv: "260〜520件",     revenue: "¥130,000〜260,000",  note: "スケール開始" },
  { month: "7月",         accounts: "20〜30", cv: "520〜780件",     revenue: "¥260,000〜390,000",  note: "安定運用期" },
  { month: "8月以降",     accounts: "40〜50", cv: "1,040〜1,300件", revenue: "¥520,000〜650,000",  note: "凍結バッファ込み" },
];

const KPI_ROWS: KpiRow[] = [
  { metric: "ストーリー到達率", target: "30%以上" },
  { metric: "CTR",              target: "3〜5%" },
  { metric: "CVR",              target: "5〜15%" },
];

const SCHEDULE: ScheduleRow[] = [
  { date: "4/28", task: "SNSコントロールタワー中期戦略タブ実装",   responsible: "開発" },
  { date: "4/29", task: "DMオートメーション最終調整・テスト",       responsible: "開発" },
  { date: "4/30", task: "投稿スケジューラー連携確認",               responsible: "開発" },
  { date: "5/1",  task: "統合テスト・バグ修正",                     responsible: "開発" },
  { date: "5/2",  task: "Phase 1 完了・本番デプロイ",               responsible: "開発" },
  { date: "5/3",  task: "Phase 2 開始・Natalia初日投稿",            responsible: "ユーザー" },
  { date: "5/4",  task: "投稿パフォーマンス確認・モニタリング開始", responsible: "自動" },
  { date: "5/5",  task: "エンゲージメント指標集計",                 responsible: "自動" },
  { date: "5/6",  task: "DM反応確認・CV初回計測",                   responsible: "ユーザー" },
  { date: "5/7",  task: "投稿パターン・時間帯調整",                 responsible: "ユーザー" },
  { date: "5/8",  task: "週次KPIレビュー（第1週）",                 responsible: "ユーザー" },
  { date: "5/9",  task: "コンテンツ改善・次週投稿準備",             responsible: "ユーザー" },
  { date: "5/10", task: "フォロワー増加施策実施",                   responsible: "ユーザー" },
  { date: "5/11", task: "DM自動化効果測定・ABテスト",               responsible: "自動" },
  { date: "5/12", task: "ハッシュタグ戦略見直し",                   responsible: "ユーザー" },
  { date: "5/13", task: "リール企画・撮影・予約投稿",               responsible: "ユーザー" },
  { date: "5/14", task: "週次パフォーマンスレポート自動生成",       responsible: "自動" },
  { date: "5/15", task: "Phase 2 最終データ収集・分析",             responsible: "自動" },
  { date: "5/16", task: "Phase 2 完了レビュー・Phase 3準備",        responsible: "ユーザー" },
  { date: "5/17", task: "Phase 3 開始・追加4アカウント設定",        responsible: "ユーザー" },
  { date: "5/18", task: "全5アカウント初期投稿・スケジュール設定",  responsible: "自動" },
  { date: "5/19", task: "マルチアカウント監視ダッシュボード確認",   responsible: "自動" },
  { date: "5/20", task: "投稿スケジュール最適化（時間帯分散）",     responsible: "自動" },
  { date: "5/21", task: "DM反応率アカウント間比較分析",             responsible: "自動" },
  { date: "5/22", task: "アカウント別KPI個別確認",                  responsible: "ユーザー" },
  { date: "5/23", task: "コンテンツABテスト集計",                   responsible: "自動" },
  { date: "5/24", task: "週次全体パフォーマンスレポート",           responsible: "自動" },
  { date: "5/25", task: "最適投稿時間帯・頻度チューニング",         responsible: "自動" },
  { date: "5/26", task: "エンゲージメント施策強化（コメント返し）", responsible: "ユーザー" },
  { date: "5/27", task: "CV率改善施策・LPリンク最適化",             responsible: "ユーザー" },
  { date: "5/28", task: "Phase 3 中間レビュー・修正方針策定",       responsible: "ユーザー" },
  { date: "5/29", task: "Phase 4スケール計画策定・インフラ準備",    responsible: "開発" },
  { date: "5/30", task: "30〜50アカウント体制設計・仕様確定",       responsible: "開発" },
  { date: "5/31", task: "Phase 3 完了・Phase 4移行判断・承認",      responsible: "ユーザー" },
];

const USER_TASKS: CheckItem[] = [
  { id: "ut_01", label: "NataliaアカウントのInstagramプロフィール最終確認・更新" },
  { id: "ut_02", label: "Phase 2開始前ストーリーハイライト設定" },
  { id: "ut_03", label: "DMテンプレート文言の最終確認・承認" },
  { id: "ut_04", label: "5/3〜5/7の投稿コンテンツ素材準備" },
  { id: "ut_05", label: "毎週の週次KPIレビューミーティングへの参加" },
  { id: "ut_06", label: "Phase 3用追加4アカウントの準備（5/15まで）" },
  { id: "ut_07", label: "Phase 4スケール承認判断（5/31）" },
  { id: "ut_08", label: "各フェーズ完了レポートの確認・フィードバック" },
];

const CONFIRM_TASKS: CheckItem[] = [
  { id: "cf_01", label: "Threadsの1日あたり投稿数（140万インプレッションの前提確認）" },
  { id: "cf_02", label: "Threads:Instagramのアカウント対応（1:1 or 1:多）" },
  { id: "cf_03", label: "Instagram側のプロフィール設定（Threadsバイオ→Instagramリンク→ストーリー閲覧の導線確認）" },
  { id: "cf_04", label: "案件別CVR比較（LINE登録 vs アプリDL、どちらが高いか）" },
  { id: "cf_05", label: "プロキシ導入計画（20アカウント以上運用時のIP分散）" },
  { id: "cf_06", label: "収集対象Threadsアカウントリスト（熟女系、5〜10件）" },
];

// ─── 色定義 ──────────────────────────────────────────────────

const RESPONSIBLE_COLORS: Record<Responsible, { bg: string; text: string; border: string }> = {
  開発:     { bg: "rgba(59,130,246,0.15)",  text: "#60a5fa", border: "rgba(59,130,246,0.4)" },
  ユーザー: { bg: "rgba(249,115,22,0.15)",  text: "#fb923c", border: "rgba(249,115,22,0.4)" },
  自動:     { bg: "rgba(34,197,94,0.15)",   text: "#4ade80", border: "rgba(34,197,94,0.4)" },
};

// ─── ユーティリティ ─────────────────────────────────────────

function getCurrentPhase(): number {
  const now = new Date();
  for (const p of PHASES) {
    if (now >= p.startDate && now <= p.endDate) return p.id;
  }
  if (now < PHASES[0].startDate) return 0;
  return 4;
}

function getPhaseProgress(phase: Phase): number {
  const now = new Date();
  if (now < phase.startDate) return 0;
  if (now > phase.endDate) return 100;
  const total = phase.endDate.getTime() - phase.startDate.getTime();
  const elapsed = now.getTime() - phase.startDate.getTime();
  return Math.round((elapsed / total) * 100);
}

// ─── 共通コンポーネント ──────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(139,92,246,0.12)",
    }}>
      <h2 className="text-base font-semibold mb-4" style={{
        background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}>{title}</h2>
      {children}
    </div>
  );
}

function CheckList({ items, storageKey }: { items: CheckItem[]; storageKey: string }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setChecked(JSON.parse(saved));
    } catch {}
  }, [storageKey]);

  const toggle = (id: string) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };

  const doneCount = items.filter((t) => checked[t.id]).length;

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-full rounded-full transition-all duration-500" style={{
            width: `${(doneCount / items.length) * 100}%`,
            background: "linear-gradient(90deg, #4ade80, #22c55e)",
          }} />
        </div>
        <span className="text-xs font-medium shrink-0" style={{ color: "rgba(240,238,255,0.5)" }}>
          {doneCount}/{items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const done = !!checked[item.id];
          return (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className="flex items-start gap-3 w-full text-left rounded-xl px-3 py-2.5 transition-all"
              style={{
                background: done ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.02)",
                border: done ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(139,92,246,0.08)",
              }}
            >
              {done
                ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#4ade80" }} />
                : <Circle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "rgba(240,238,255,0.25)" }} />
              }
              <span className="text-sm" style={{
                color: done ? "rgba(240,238,255,0.4)" : "rgba(240,238,255,0.75)",
                textDecoration: done ? "line-through" : undefined,
              }}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─── 開発進捗データ ───────────────────────────────────────────

const DEV_DONE = [
  "IGストーリー テキストオーバーレイ実装（Playwrightコード）",
  "IGストーリー アフィリエイトリンクスティッカー実装",
  "BullMQ IGストーリーワーカー + APIルート（POST /api/instagram/story）",
  "IGストーリー投稿UI（/posts/story）— 画像選択・リンク管理付き",
  "IGストーリー 画像一覧API（GET /api/instagram/stories/uploads）",
  "中期戦略タブ新設（このページ）",
  "Threadsアカウント分析ページに「Threads投稿」「IG投稿」タブ統合",
];

const DEV_PENDING_USER = [
  { label: "画像を格納する（下記フォルダへ）", detail: "~/projects/sns-automation/uploads/instagram-stories/" },
  { label: "Nataliaアカウントのセッション有効性確認", detail: "ターミナルで: cd ~/projects/sns-automation && pnpm worker && IG動作確認" },
  { label: "アフィリエイトURL・ボタンテキストを登録", detail: "Threadsアカウント分析 → 「IG投稿」タブ → 「アフィリエイトリンク → リンクを保存」で登録" },
  { label: "Natalia実機テスト（ストーリー1件投稿）", detail: "Threadsアカウント分析 → 「IG投稿」タブ → 画像選択 → 「ストーリー投稿」" },
];

const DEV_PENDING_DEV = [
  "Nataliaテスト後のバグ修正（実機テスト結果次第）",
  "Instagramログインセッション自動リフレッシュ（Cookieが切れた場合の再ログイン）",
  "IG凍結対策（User-Agent偽装・待機時間調整）",
];

const TECH_NOTES = [
  { label: "画像格納フォルダ（WSL絶対パス）", value: "/home/himawari_pchimawari_pc/projects/sns-automation/uploads/instagram-stories/" },
  { label: "ターミナルでのフォルダ移動", value: "cd ~/projects/sns-automation/uploads/instagram-stories" },
  { label: "Nataliaアカウント（.env）", value: "INSTAGRAM_USERNAME=natalia_r_29 / PW=lovelovelove" },
  { label: "APIサーバー起動", value: "cd ~/projects/sns-automation && pnpm dev" },
  { label: "IG投稿UIのURL", value: "http://localhost:3001/threads-analysis（→ IG投稿タブ）" },
  { label: "Gemini APIキーについて", value: "IGストーリー投稿には不要。キャプション自動生成機能（別タスク）で使用予定" },
];

// ─── 開発進捗セクション ──────────────────────────────────────

function DevStatusSection() {
  return (
    <SectionCard title="開発進捗 & 明日の再開ガイド">
      <div className="space-y-5">
        {/* 実装済み */}
        <div>
          <p className="text-xs font-bold mb-2" style={{ color: "#4ade80" }}>✅ 実装済み</p>
          <div className="space-y-1.5">
            {DEV_DONE.map((item, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
                <span className="text-xs mt-0.5" style={{ color: "#4ade80" }}>✓</span>
                <span className="text-xs" style={{ color: "rgba(240,238,255,0.75)" }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ユーザー対応待ち */}
        <div>
          <p className="text-xs font-bold mb-2" style={{ color: "#fbbf24" }}>⏳ ユーザー対応待ち（次に必要なこと）</p>
          <div className="space-y-2">
            {DEV_PENDING_USER.map((item, i) => (
              <div key={i} className="rounded-lg px-3 py-2.5 space-y-1" style={{ background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.2)" }}>
                <p className="text-xs font-medium" style={{ color: "#fbbf24" }}>{i + 1}. {item.label}</p>
                <p className="text-xs font-mono break-all" style={{ color: "rgba(240,238,255,0.5)" }}>{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 開発対応待ち */}
        <div>
          <p className="text-xs font-bold mb-2" style={{ color: "#60a5fa" }}>🔧 開発対応待ち（テスト後に着手）</p>
          <div className="space-y-1.5">
            {DEV_PENDING_DEV.map((item, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                <span className="text-xs mt-0.5" style={{ color: "#60a5fa" }}>○</span>
                <span className="text-xs" style={{ color: "rgba(240,238,255,0.65)" }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 技術メモ */}
        <div>
          <p className="text-xs font-bold mb-2" style={{ color: "#a78bfa" }}>📋 技術メモ（パス・コマンド）</p>
          <div className="space-y-2">
            {TECH_NOTES.map((note, i) => (
              <div key={i} className="rounded-lg px-3 py-2 space-y-0.5" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
                <p className="text-[10px] font-semibold" style={{ color: "rgba(167,139,250,0.7)" }}>{note.label}</p>
                <p className="text-xs font-mono break-all" style={{ color: "rgba(240,238,255,0.8)" }}>{note.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── セクション ───────────────────────────────────────────────

function FlowSection() {
  return (
    <SectionCard title="動線フロー">
      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        {FLOW_STEPS.map((step, i) => (
          <div key={i} className="flex flex-col sm:flex-row items-center gap-2 flex-1 min-w-0">
            <div className="flex flex-col items-center text-center rounded-xl p-3 w-full flex-1" style={{
              background: "rgba(124,58,237,0.1)",
              border: "1px solid rgba(139,92,246,0.2)",
            }}>
              <span className="text-2xl mb-1">{step.emoji}</span>
              <span className="text-xs font-medium leading-snug whitespace-pre-line" style={{ color: "rgba(240,238,255,0.8)" }}>
                {step.label}
              </span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <ArrowRight className="h-4 w-4 shrink-0 hidden sm:block" style={{ color: "rgba(167,139,250,0.5)" }} />
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function FunnelSection() {
  return (
    <SectionCard title="ファネル試算（1アカウント・月間）">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(139,92,246,0.15)" }}>
              {["ステップ", "換算率", "人数/件数"].map((h) => (
                <th key={h} className="text-left pb-2 pr-4 text-xs font-semibold"
                  style={{ color: "rgba(240,238,255,0.4)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FUNNEL_ROWS.map((row, i) => (
              <tr key={i} style={{
                borderBottom: "1px solid rgba(139,92,246,0.06)",
                background: row.isHighlight ? "rgba(34,197,94,0.05)" : undefined,
              }}>
                <td className="py-2.5 pr-4" style={{
                  color: row.isHighlight ? "#4ade80" : "rgba(240,238,255,0.75)",
                  fontWeight: row.isHighlight ? 700 : 400,
                }}>{row.step}</td>
                <td className="py-2.5 pr-4 font-mono text-xs" style={{ color: "rgba(240,238,255,0.45)" }}>{row.rate}</td>
                <td className="py-2.5 font-bold" style={{
                  color: row.isHighlight ? "#4ade80" : "rgba(240,238,255,0.85)",
                }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function PhaseSection({ currentPhase }: { currentPhase: number }) {
  return (
    <SectionCard title="フェーズ概要">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {PHASES.map((phase) => {
          const isCurrent = phase.id === currentPhase;
          const isDone = phase.id < currentPhase;
          const progress = getPhaseProgress(phase);
          return (
            <div key={phase.id} className="rounded-xl p-4" style={{
              background: isCurrent
                ? "linear-gradient(135deg, rgba(124,58,237,0.22) 0%, rgba(168,85,247,0.1) 100%)"
                : isDone ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
              border: isCurrent
                ? "1px solid rgba(167,139,250,0.5)"
                : "1px solid rgba(139,92,246,0.1)",
            }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold" style={{ color: isCurrent ? "#a78bfa" : "rgba(240,238,255,0.5)" }}>
                  {phase.label}
                </span>
                {isCurrent && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                    background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                    color: "#fff",
                  }}>進行中</span>
                )}
                {isDone && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                    background: "rgba(34,197,94,0.2)",
                    color: "#4ade80",
                    border: "1px solid rgba(34,197,94,0.3)",
                  }}>完了</span>
                )}
              </div>
              <p className="text-xs mb-1" style={{ color: "rgba(240,238,255,0.4)" }}>{phase.period}</p>
              <p className="text-sm font-medium mb-3" style={{ color: isCurrent ? "rgba(240,238,255,0.9)" : "rgba(240,238,255,0.55)" }}>
                {phase.description}
              </p>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all duration-700" style={{
                  width: `${isDone ? 100 : isCurrent ? progress : 0}%`,
                  background: isDone
                    ? "linear-gradient(90deg, #4ade80, #22c55e)"
                    : "linear-gradient(90deg, #7c3aed, #a855f7)",
                }} />
              </div>
              <p className="text-[10px] mt-1" style={{ color: "rgba(240,238,255,0.3)" }}>
                {isDone ? "100%" : isCurrent ? `${progress}%` : "0%"}
              </p>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function RevenueSection() {
  return (
    <SectionCard title="月次目標収益">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(139,92,246,0.15)" }}>
              {["月", "稼働アカウント", "月間CV", "月間収益", "備考"].map((h) => (
                <th key={h} className="text-left pb-2 pr-4 text-xs font-semibold"
                  style={{ color: "rgba(240,238,255,0.4)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REVENUE_ROWS.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(139,92,246,0.06)" }}>
                <td className="py-2.5 pr-4 font-medium whitespace-nowrap" style={{ color: "rgba(240,238,255,0.85)" }}>{row.month}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap" style={{ color: "rgba(240,238,255,0.6)" }}>{row.accounts}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap" style={{ color: "rgba(240,238,255,0.6)" }}>{row.cv}</td>
                <td className="py-2.5 pr-4 font-semibold whitespace-nowrap" style={{
                  background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>{row.revenue}</td>
                <td className="py-2.5 text-xs" style={{ color: "rgba(240,238,255,0.45)" }}>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs" style={{ color: "rgba(240,238,255,0.35)" }}>
        ※ 凍結リスク15〜20%を想定し、目標より多めにアカウントを保有
      </p>
    </SectionCard>
  );
}

function KpiSection() {
  return (
    <SectionCard title="検証KPI">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {KPI_ROWS.map((row, i) => (
          <div key={i} className="rounded-xl p-4 text-center" style={{
            background: "rgba(124,58,237,0.08)",
            border: "1px solid rgba(139,92,246,0.15)",
          }}>
            <p className="text-xs mb-1" style={{ color: "rgba(240,238,255,0.45)" }}>{row.metric}</p>
            <p className="text-xl font-bold" style={{
              background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>{row.target}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ScheduleSection() {
  const [collapsed, setCollapsed] = useState(true);
  const today = new Date();
  const todayStr = `${today.getMonth() + 1}/${today.getDate()}`;
  const visibleRows = collapsed ? SCHEDULE.slice(0, 7) : SCHEDULE;

  return (
    <SectionCard title="日別スケジュール（4/28〜5/31）">
      <div className="flex flex-wrap gap-3 mb-4">
        {(Object.entries(RESPONSIBLE_COLORS) as [Responsible, typeof RESPONSIBLE_COLORS[Responsible]][]).map(([key, c]) => (
          <span key={key} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{
            background: c.bg, color: c.text, border: `1px solid ${c.border}`,
          }}>{key}</span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(139,92,246,0.15)" }}>
              {["日付", "タスク", "担当"].map((h) => (
                <th key={h} className="text-left pb-2 pr-4 text-xs font-semibold"
                  style={{ color: "rgba(240,238,255,0.4)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => {
              const isToday = row.date === todayStr;
              const c = RESPONSIBLE_COLORS[row.responsible];
              return (
                <tr key={i} style={{
                  borderBottom: "1px solid rgba(139,92,246,0.06)",
                  background: isToday ? "rgba(124,58,237,0.08)" : undefined,
                }}>
                  <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap" style={{
                    color: isToday ? "#a78bfa" : "rgba(240,238,255,0.45)",
                    fontWeight: isToday ? 700 : 400,
                  }}>
                    {isToday ? `★ ${row.date}` : row.date}
                  </td>
                  <td className="py-2 pr-4" style={{ color: "rgba(240,238,255,0.8)" }}>{row.task}</td>
                  <td className="py-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{
                      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                    }}>{row.responsible}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="mt-3 flex items-center gap-1.5 text-xs font-medium"
        style={{ color: "rgba(167,139,250,0.7)" }}
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {collapsed ? `残り${SCHEDULE.length - 7}件を表示` : "折りたたむ"}
      </button>
    </SectionCard>
  );
}

// ─── メインページ（Threads向け） ─────────────────────────────

function ThreadsStrategyContent() {
  const currentPhase = getCurrentPhase();

  return (
    <div className="min-h-screen p-4 sm:p-6 space-y-5"
      style={{ background: "linear-gradient(180deg, rgba(13,10,25,1) 0%, rgba(10,8,20,1) 100%)" }}>

      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl shrink-0" style={{
          background: "linear-gradient(135deg, #7c3aed, #a855f7)",
          boxShadow: "0 0 20px rgba(139,92,246,0.4)",
        }}>
          <TrendingUp className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{
            background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>中期戦略</h1>
          <p className="text-xs" style={{ color: "rgba(240,238,255,0.35)" }}>
            SNSコントロールタワー — Phase {currentPhase > 0 ? currentPhase : 1} 進行中
          </p>
        </div>
      </div>

      {/* 開発進捗・再開ガイド */}
      <DevStatusSection />

      {/* A. 動線フロー図（最上部） */}
      <FlowSection />

      {/* B. ファネル試算テーブル */}
      <FunnelSection />

      {/* フェーズ概要 */}
      <PhaseSection currentPhase={currentPhase} />

      {/* C. 月次目標収益（実数ベース・備考列付き） */}
      <RevenueSection />

      {/* 検証KPI */}
      <KpiSection />

      {/* 日別スケジュール */}
      <ScheduleSection />

      {/* ユーザーボールリスト */}
      <SectionCard title="ユーザーボールリスト">
        <CheckList items={USER_TASKS} storageKey="mid_term_user_tasks" />
      </SectionCard>

      {/* D. 確認事項チェックリスト */}
      <SectionCard title="以下の情報をご共有ください">
        <CheckList items={CONFIRM_TASKS} storageKey="mid_term_confirm_tasks" />
      </SectionCard>
    </div>
  );
}

// ─── トップタブ付きラッパー: Threads戦略 / Instagram戦略 ──────────
type StrategyTab = "threads" | "ig";

export default function MidTermStrategyPage() {
  const [tab, setTab] = useState<StrategyTab>("threads");
  return (
    <div className="min-h-screen"
      style={{ background: "linear-gradient(180deg, rgba(13,10,25,1) 0%, rgba(10,8,20,1) 100%)" }}>
      <div className="flex gap-1 px-4 sm:px-6 pt-4 pb-2">
        <button
          onClick={() => setTab("threads")}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all"
          style={tab === "threads" ? {
            background: "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(168,85,247,0.4))",
            border: "1px solid rgba(139,92,246,0.5)",
            color: "#e9d5ff",
          } : {
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(139,92,246,0.15)",
            color: "rgba(240,238,255,0.5)",
          }}
        >
          <TrendingUp className="h-4 w-4" />
          Threads中期戦略
        </button>
        <button
          onClick={() => setTab("ig")}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all"
          style={tab === "ig" ? {
            background: "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(168,85,247,0.4))",
            border: "1px solid rgba(139,92,246,0.5)",
            color: "#e9d5ff",
          } : {
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(139,92,246,0.15)",
            color: "rgba(240,238,255,0.5)",
          }}
        >
          <Target className="h-4 w-4" />
          Instagram中期戦略
        </button>
      </div>
      {tab === "threads" ? <ThreadsStrategyContent /> : <IgStrategyContent />}
    </div>
  );
}
