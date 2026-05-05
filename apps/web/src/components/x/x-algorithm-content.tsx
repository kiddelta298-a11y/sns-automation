"use client";

import { useState } from "react";
import {
  Brain, ChevronDown, ChevronRight,
  Heart, MessageCircle, Repeat2, Share, Eye, UserPlus,
  Ban, VolumeX, Flag, MousePointerClick,
  Image, Quote, Clock, Link2, UserCheck,
  Filter, Layers, Zap, Search, Database, Shield,
  ArrowRight, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── データ定義 ─────────────────────────────────────────────

type TabKey = "overview" | "scoring" | "pipeline" | "filters" | "tips";

interface TabDef {
  key: TabKey;
  label: string;
  short: string;
}

const TABS: TabDef[] = [
  { key: "overview",  label: "全体像",           short: "概要" },
  { key: "scoring",   label: "スコアリング",     short: "スコア" },
  { key: "pipeline",  label: "パイプライン",     short: "処理順" },
  { key: "filters",   label: "フィルタリング",   short: "除外" },
  { key: "tips",      label: "バズるためのTips", short: "Tips" },
];

// スコアリングウェイト（公式ソースで params が非公開のため推定値ベース）
interface ScoreAction {
  name: string;
  key: string;
  icon: typeof Heart;
  direction: "positive" | "negative";
  impact: "very-high" | "high" | "medium" | "low";
  description: string;
}

const SCORE_ACTIONS: ScoreAction[] = [
  { name: "いいね (Favorite)",       key: "favorite",      icon: Heart,            direction: "positive", impact: "very-high", description: "最も重要な指標。いいねの予測確率が最終スコアの主要ドライバー" },
  { name: "リプライ (Reply)",        key: "reply",         icon: MessageCircle,    direction: "positive", impact: "very-high", description: "会話を生む投稿はアルゴリズムに高評価される" },
  { name: "リポスト (Repost)",       key: "repost",        icon: Repeat2,          direction: "positive", impact: "high",      description: "拡散力の指標。リポストはリーチ拡大に直結" },
  { name: "引用 (Quote)",            key: "quote",         icon: Quote,            direction: "positive", impact: "high",      description: "引用リポストは意見表明を伴うため高重み" },
  { name: "シェア (Share)",          key: "share",         icon: Share,            direction: "positive", impact: "high",      description: "DM/コピーリンクでの共有はバイラル指標" },
  { name: "DMシェア",                key: "share_dm",      icon: Link2,            direction: "positive", impact: "medium",    description: "DMでの直接共有" },
  { name: "リンクコピー",            key: "share_copy",    icon: Link2,            direction: "positive", impact: "medium",    description: "リンクをコピーしての共有" },
  { name: "クリック (Click)",        key: "click",         icon: MousePointerClick,direction: "positive", impact: "medium",    description: "投稿内リンクや詳細へのクリック" },
  { name: "プロフクリック",          key: "profile_click", icon: UserCheck,        direction: "positive", impact: "medium",    description: "プロフィールページへの遷移" },
  { name: "画像拡大",                key: "photo_expand",  icon: Image,            direction: "positive", impact: "medium",    description: "画像をタップして拡大表示" },
  { name: "動画視聴 (VQV)",          key: "vqv",           icon: Eye,              direction: "positive", impact: "medium",    description: "動画の品質閲覧。一定以上の再生時間で加算" },
  { name: "滞在 (Dwell)",            key: "dwell",         icon: Clock,            direction: "positive", impact: "medium",    description: "投稿上での滞在時間。長く読まれるほど高評価" },
  { name: "引用クリック",            key: "quoted_click",  icon: MousePointerClick,direction: "positive", impact: "low",       description: "引用元の投稿をクリック" },
  { name: "フォロー (Follow)",       key: "follow",        icon: UserPlus,         direction: "positive", impact: "high",      description: "投稿をきっかけにフォローする行動" },
  { name: "興味なし",                key: "not_interested",icon: Ban,              direction: "negative", impact: "high",      description: "「興味なし」報告。スコアが大きくマイナス" },
  { name: "ブロック",                key: "block",         icon: Ban,              direction: "negative", impact: "very-high", description: "ブロック予測が高い投稿は大幅に減点" },
  { name: "ミュート",                key: "mute",          icon: VolumeX,          direction: "negative", impact: "high",      description: "ミュートされる予測が高いと減点" },
  { name: "通報 (Report)",           key: "report",        icon: Flag,             direction: "negative", impact: "very-high", description: "通報予測が高い投稿は最も大きくペナルティ" },
];

// パイプラインステージ
interface PipelineStage {
  name: string;
  description: string;
  icon: typeof Search;
  detail: string;
  color: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  {
    name: "1. クエリ水和 (Query Hydration)",
    description: "ユーザー情報の取得",
    icon: UserCheck,
    detail: "ユーザーのエンゲージメント履歴（いいね・リプライ・リポストの履歴）、フォローリスト、設定情報を取得。Grokモデルへの入力として使う。",
    color: "rgba(59,130,246,0.8)",
  },
  {
    name: "2. 候補ソーシング (Candidate Sourcing)",
    description: "表示候補の投稿を収集",
    icon: Search,
    detail: "Thunder（フォロー中の直近投稿をインメモリで保持）+ Phoenix Retrieval（Two-Towerモデルでフォロー外の関連投稿を類似度検索）の2ソースから候補を収集。",
    color: "rgba(168,85,247,0.8)",
  },
  {
    name: "3. 候補水和 (Candidate Hydration)",
    description: "候補投稿のメタデータ追加",
    icon: Database,
    detail: "テキスト・メディア・投稿者情報（認証バッジ、フォロワー数）・動画長・サブスクリプション情報などを付与。",
    color: "rgba(236,72,153,0.8)",
  },
  {
    name: "4. プレスコアフィルタ",
    description: "不適格な投稿を除外",
    icon: Filter,
    detail: "重複・古い投稿・自分の投稿・ブロック/ミュートアカウント・ミュートキーワード・既読投稿・不適格サブスク投稿を除外。",
    color: "rgba(249,115,22,0.8)",
  },
  {
    name: "5. スコアリング (Scoring)",
    description: "エンゲージメント予測 & ランキング",
    icon: Zap,
    detail: "Phoenix Scorer（Grokトランスフォーマーで19種のエンゲージメント確率を予測）→ Weighted Scorer（重み付き合算）→ Author Diversity Scorer（同一著者の連続表示を抑制）→ OON Scorer（フォロー外コンテンツの調整）。",
    color: "rgba(34,197,94,0.8)",
  },
  {
    name: "6. セレクション (Selection)",
    description: "上位K件を選択",
    icon: Layers,
    detail: "最終スコアで降順ソートし、タイムラインに表示する上位K件を選択。",
    color: "rgba(14,165,233,0.8)",
  },
  {
    name: "7. ポストセレクションフィルタ",
    description: "最終チェック",
    icon: Shield,
    detail: "VFFilter（削除済み/スパム/暴力/ゴアの除外）+ DedupConversationFilter（同一会話スレッドの重複排除）。",
    color: "rgba(239,68,68,0.8)",
  },
];

// フィルタ一覧
interface FilterInfo {
  name: string;
  stage: "pre" | "post";
  description: string;
}

const FILTERS: FilterInfo[] = [
  { name: "DropDuplicatesFilter",           stage: "pre",  description: "重複した投稿IDを除去" },
  { name: "CoreDataHydrationFilter",        stage: "pre",  description: "メタデータ取得に失敗した投稿を除外" },
  { name: "AgeFilter",                      stage: "pre",  description: "古すぎる投稿を除外（しきい値ベース）" },
  { name: "SelfpostFilter",                 stage: "pre",  description: "自分自身の投稿を除外" },
  { name: "RepostDeduplicationFilter",      stage: "pre",  description: "同じコンテンツのリポストを重複排除" },
  { name: "IneligibleSubscriptionFilter",   stage: "pre",  description: "アクセスできないサブスク限定コンテンツを除外" },
  { name: "PreviouslySeenPostsFilter",      stage: "pre",  description: "既に閲覧済みの投稿を除外" },
  { name: "PreviouslyServedPostsFilter",    stage: "pre",  description: "同セッションで既に表示された投稿を除外" },
  { name: "MutedKeywordFilter",             stage: "pre",  description: "ユーザーがミュートしたキーワードを含む投稿を除外" },
  { name: "AuthorSocialgraphFilter",        stage: "pre",  description: "ブロック/ミュートしたアカウントの投稿を除外" },
  { name: "VFFilter",                       stage: "post", description: "削除済み・スパム・暴力・ゴアなどの投稿を除外" },
  { name: "DedupConversationFilter",        stage: "post", description: "同一会話スレッドの複数分岐を重複排除" },
];

// バズるためのTips
interface Tip {
  title: string;
  description: string;
  algorithmReason: string;
  impact: "very-high" | "high" | "medium";
}

const TIPS: Tip[] = [
  {
    title: "リプライを誘発する質問・意見を含める",
    description: "「あなたはどう思いますか？」「経験ある人いますか？」のような問いかけを入れる。",
    algorithmReason: "reply_score は weight が非常に高い。会話が生まれる投稿はスコアが大幅に上がる。",
    impact: "very-high",
  },
  {
    title: "画像・動画を添付する",
    description: "テキストだけよりも、視覚的に目を引く画像やショート動画を付ける。",
    algorithmReason: "photo_expand_score と vqv_score が加算される。特に動画は一定再生時間でボーナス。",
    impact: "high",
  },
  {
    title: "最初の1行で惹きつける（Hook）",
    description: "タイムラインで最初に見える1行目に強いフックを入れて、読み進めてもらう。",
    algorithmReason: "dwell_score（滞在時間）が重要指標。Hookで止まらせることで滞在時間が伸びスコアUP。",
    impact: "very-high",
  },
  {
    title: "リポスト・引用したくなる情報を提供",
    description: "有益な数字、独自の分析、保存したくなるリスト形式のコンテンツ。",
    algorithmReason: "repost_score + quote_score + share_score の3つが同時に上がり、複合的にスコア加算。",
    impact: "very-high",
  },
  {
    title: "フォローしたくなるプロフを整える",
    description: "投稿を見た人が「この人フォローしよう」と思えるプロフィールにする。",
    algorithmReason: "follow_author_score は高い正の重みを持つ。投稿からのフォロー転換率が高いとスコア上昇。",
    impact: "high",
  },
  {
    title: "ネガティブシグナルを避ける",
    description: "炎上狙い、スパム的な連投、不快なコンテンツは厳禁。",
    algorithmReason: "block_author_score, mute_author_score, report_score は非常に大きな負の重み。一度でも大量に食らうと露出激減。",
    impact: "very-high",
  },
  {
    title: "同一著者の連投を避ける",
    description: "短時間に何本も投稿するより、間隔を空けて質の高い投稿を出す。",
    algorithmReason: "Author Diversity Scorer が同一著者のスコアを減衰させる。連投すると後の投稿ほどスコアダウン。",
    impact: "high",
  },
  {
    title: "Candidate Isolation を理解する",
    description: "自分の投稿スコアは他の候補に依存しない。純粋に自分の投稿の質で勝負。",
    algorithmReason: "Phoenix モデルは Candidate Isolation（候補間の attention を遮断）を採用。他人の投稿と比較ではなく、絶対的な関連性で評価。",
    impact: "medium",
  },
  {
    title: "フォロー外リーチを狙う",
    description: "ニッチすぎない普遍的なテーマを含めると、Phoenix Retrieval でフォロー外ユーザーにもリーチ。",
    algorithmReason: "Two-Tower Retrieval Model が埋め込みの類似度でフォロー外コンテンツを発見。幅広い関心層に刺さるトピックが有利。",
    impact: "high",
  },
];

// ─── Impact バッジ ─────────────────────────────────────────
function ImpactBadge({ impact }: { impact: "very-high" | "high" | "medium" | "low" }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    "very-high": { bg: "rgba(239,68,68,0.15)",   text: "#f87171", label: "最重要" },
    "high":      { bg: "rgba(249,115,22,0.15)",   text: "#fb923c", label: "重要" },
    "medium":    { bg: "rgba(59,130,246,0.15)",    text: "#60a5fa", label: "中" },
    "low":       { bg: "rgba(107,114,128,0.15)",   text: "#9ca3af", label: "低" },
  };
  const s = styles[impact];
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

// ─── 展開可能カード ─────────────────────────────────────────
function ExpandableCard({
  title, children, defaultOpen = false, headerRight,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  headerRight?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors"
        style={{ color: "rgba(240,238,255,0.88)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.08)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "#a78bfa" }} /> : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#a78bfa" }} />}
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {headerRight}
      </button>
      {open && (
        <div className="px-5 pb-4 pt-0">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── メインページ ───────────────────────────────────────────
export function XAlgorithmContent() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  return (
    <div className="space-y-6">
      {/* ── ヘッダー ── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
            boxShadow: "0 0 20px rgba(6,182,212,0.35)",
          }}>
          <Brain className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-lg font-bold"
            style={{
              background: "linear-gradient(135deg, #c4b5fd, #67e8f9)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
            X For You アルゴリズム解析
          </h1>
          <p className="text-xs" style={{ color: "rgba(240,238,255,0.4)" }}>
            xAI公開ソースコードに基づくXの「おすすめ」フィード仕組みの完全解説
          </p>
        </div>
      </div>

      {/* ── タブ ── */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="rounded-xl px-4 py-2 text-sm font-medium transition-all whitespace-nowrap"
              style={isActive ? {
                background: "linear-gradient(135deg, rgba(124,58,237,0.32), rgba(6,182,212,0.16))",
                color: "#e9d5ff",
                border: "1px solid rgba(167,139,250,0.5)",
              } : {
                background: "transparent",
                color: "rgba(240,238,255,0.5)",
                border: "1px solid transparent",
              }}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.short}</span>
            </button>
          );
        })}
      </div>

      {/* ── コンテンツ ── */}
      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "scoring" && <ScoringTab />}
      {activeTab === "pipeline" && <PipelineTab />}
      {activeTab === "filters" && <FiltersTab />}
      {activeTab === "tips" && <TipsTab />}
    </div>
  );
}

// ━━━━━ 全体像タブ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function OverviewTab() {
  return (
    <div className="space-y-6">
      {/* 概要 */}
      <div className="rounded-xl p-5" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
        <h2 className="text-base font-bold mb-3" style={{ color: "#c4b5fd" }}>
          Xの「おすすめ」フィードはどう動くか
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "rgba(240,238,255,0.75)" }}>
          For Youタイムラインは、<strong style={{ color: "#e9d5ff" }}>2つのソースから候補を集め</strong>、
          <strong style={{ color: "#e9d5ff" }}>Grokベースのトランスフォーマーモデル (Phoenix)</strong> で
          ユーザーごとのエンゲージメント確率を予測し、重み付きスコアで並べ替えたものです。
          手作業の特徴量エンジニアリングは一切なく、すべてをAIモデルに委ねています。
        </p>
      </div>

      {/* 2つのソース */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl p-5" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-5 w-5" style={{ color: "#a855f7" }} />
            <h3 className="text-sm font-bold" style={{ color: "#d8b4fe" }}>
              Thunder（イン・ネットワーク）
            </h3>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.65)" }}>
            フォローしているアカウントの直近の投稿をインメモリで保持。
            Kafkaからリアルタイムで投稿の作成/削除イベントを受信し、サブミリ秒でルックアップ。
            保持期間を超えた投稿は自動でトリム。
          </p>
        </div>

        <div className="rounded-xl p-5" style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-5 w-5" style={{ color: "#06b6d4" }} />
            <h3 className="text-sm font-bold" style={{ color: "#67e8f9" }}>
              Phoenix Retrieval（アウト・オブ・ネットワーク）
            </h3>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.65)" }}>
            Two-Towerモデルで全投稿をベクトル化し、ユーザーの興味と類似した投稿を検索。
            User Tower（ユーザーの行動履歴をエンコード）と Candidate Tower（投稿をエンコード）の
            ドット積類似度で Top-K を取得。
          </p>
        </div>
      </div>

      {/* モデル概要 */}
      <ExpandableCard title="Phoenix ランキングモデルの仕組み" defaultOpen>
        <div className="space-y-3 pt-2">
          <p className="text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.7)" }}>
            Phoenix は Grok-1 をベースにしたトランスフォーマーモデルで、ユーザーの行動履歴と候補投稿を入力とし、
            <strong style={{ color: "#e9d5ff" }}>19種類のエンゲージメントアクション</strong>の発生確率を予測します。
          </p>

          <div className="rounded-lg p-4" style={{ background: "rgba(10,8,20,0.5)", border: "1px solid rgba(139,92,246,0.1)" }}>
            <p className="text-[11px] font-mono leading-relaxed" style={{ color: "rgba(240,238,255,0.6)" }}>
              入力: [User Embedding] + [履歴128件の投稿×行動] + [候補32件の投稿]<br/>
              {"  ↓ Grok Transformer (Attention Mask: 候補同士は参照不可)"}<br/>
              {"  ↓ Layer Norm → Unembedding"}<br/>
              出力: 各候補 × 19アクション の logits → sigmoid で確率化<br/>
              {"  ↓ Weighted Sum"}<br/>
              最終スコア = <span style={{ color: "#a78bfa" }}>{"Σ (weight_i × P(action_i))"}</span>
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)" }}>
            <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#06b6d4" }} />
            <p className="text-xs" style={{ color: "rgba(240,238,255,0.7)" }}>
              <strong style={{ color: "#67e8f9" }}>Candidate Isolation:</strong>{" "}
              候補投稿同士は Attention で互いを参照できません。
              つまり、あなたの投稿のスコアは同時に評価される他の投稿に依存せず、
              純粋にユーザーとの関連性で決まります。スコアはキャッシュ可能で安定しています。
            </p>
          </div>
        </div>
      </ExpandableCard>

      {/* 設計思想 */}
      <ExpandableCard title="キー設計思想">
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          {[
            { title: "手作業ゼロ", desc: "手動の特徴量エンジニアリングを完全に排除。Grokモデルがユーザーの行動シーケンスからすべてを学習。" },
            { title: "ハッシュベース埋め込み", desc: "ユーザー・投稿・著者をそれぞれ複数のハッシュ関数で埋め込みテーブルを参照。巨大な語彙に対応。" },
            { title: "マルチアクション予測", desc: "単一の「関連度」ではなく、19種類のアクションそれぞれの確率を予測し、重み付きで合算。" },
            { title: "コンポーザブル設計", desc: "Source / Hydrator / Filter / Scorer / Selector が独立したトレイトで、並列実行可能。" },
          ].map((item) => (
            <div key={item.title} className="rounded-lg p-3" style={{ background: "rgba(10,8,20,0.4)", border: "1px solid rgba(139,92,246,0.08)" }}>
              <p className="text-xs font-bold mb-1" style={{ color: "#c4b5fd" }}>{item.title}</p>
              <p className="text-[11px] leading-relaxed" style={{ color: "rgba(240,238,255,0.6)" }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </ExpandableCard>
    </div>
  );
}

// ━━━━━ スコアリングタブ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ScoringTab() {
  const [filter, setFilter] = useState<"all" | "positive" | "negative">("all");
  const filtered = SCORE_ACTIONS.filter(
    (a) => filter === "all" || a.direction === filter,
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-4" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
        <p className="text-sm" style={{ color: "rgba(240,238,255,0.75)" }}>
          Phoenixモデルは候補ごとに<strong style={{ color: "#e9d5ff" }}>19種類のエンゲージメント確率</strong>を予測し、
          それぞれに重みを掛けて合算します。正のアクションは加算、負のアクションは減算されます。
        </p>
        <p className="mt-2 text-xs font-mono" style={{ color: "rgba(167,139,250,0.8)" }}>
          Final Score = {"Σ (weight_i × P(action_i))"}  →  normalize  →  offset
        </p>
      </div>

      {/* フィルタ */}
      <div className="flex gap-2">
        {([
          { key: "all", label: "すべて (19)" },
          { key: "positive", label: "正のアクション (14)" },
          { key: "negative", label: "負のアクション (5)" },
        ] as const).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
            style={filter === f.key ? {
              background: "rgba(139,92,246,0.2)",
              color: "#e9d5ff",
              border: "1px solid rgba(139,92,246,0.4)",
            } : {
              background: "transparent",
              color: "rgba(240,238,255,0.45)",
              border: "1px solid rgba(139,92,246,0.1)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* スコアリスト */}
      <div className="space-y-2">
        {filtered.map((action) => {
          const Icon = action.icon;
          return (
            <ExpandableCard
              key={action.key}
              title={action.name}
              headerRight={
                <div className="flex items-center gap-2">
                  <ImpactBadge impact={action.impact} />
                  <span className="text-[10px] font-bold"
                    style={{ color: action.direction === "positive" ? "#4ade80" : "#f87171" }}>
                    {action.direction === "positive" ? "+" : "-"}
                  </span>
                </div>
              }
            >
              <div className="flex items-start gap-3 pt-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: action.direction === "positive" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                    border: `1px solid ${action.direction === "positive" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
                  }}>
                  <Icon className="h-4 w-4" style={{ color: action.direction === "positive" ? "#4ade80" : "#f87171" }} />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.7)" }}>
                  {action.description}
                </p>
              </div>
            </ExpandableCard>
          );
        })}
      </div>
    </div>
  );
}

// ━━━━━ パイプラインタブ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PipelineTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
        <p className="text-sm" style={{ color: "rgba(240,238,255,0.75)" }}>
          Home Mixer がオーケストレーションする7段階のパイプライン。
          リクエストから最終的なランキング済みフィードができるまでの流れ。
        </p>
      </div>

      <div className="relative">
        {PIPELINE_STAGES.map((stage, i) => {
          const Icon = stage.icon;
          return (
            <div key={stage.name} className="relative flex gap-4 pb-6 last:pb-0">
              {/* 縦線 */}
              {i < PIPELINE_STAGES.length - 1 && (
                <div className="absolute left-[19px] top-10 bottom-0 w-px" style={{ background: "rgba(139,92,246,0.15)" }} />
              )}
              {/* アイコン */}
              <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: stage.color, boxShadow: `0 0 12px ${stage.color}` }}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              {/* コンテンツ */}
              <div className="flex-1 rounded-xl p-4" style={{ background: "rgba(10,8,20,0.4)", border: "1px solid rgba(139,92,246,0.08)" }}>
                <h3 className="text-sm font-bold" style={{ color: "rgba(240,238,255,0.9)" }}>{stage.name}</h3>
                <p className="text-xs mt-0.5 mb-2" style={{ color: "rgba(240,238,255,0.45)" }}>{stage.description}</p>
                <p className="text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.65)" }}>{stage.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ━━━━━ フィルタタブ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function FiltersTab() {
  const preFilters = FILTERS.filter((f) => f.stage === "pre");
  const postFilters = FILTERS.filter((f) => f.stage === "post");

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-4" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
        <p className="text-sm" style={{ color: "rgba(240,238,255,0.75)" }}>
          フィルタはスコアリングの前後2段階で適用されます。
          表示されるべきでない投稿を確実に排除するための仕組みです。
        </p>
      </div>

      {/* Pre-Scoring Filters */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: "#c4b5fd" }}>
          <Filter className="h-4 w-4" />
          プレスコアリングフィルタ（スコアリング前）
        </h2>
        <div className="rounded-xl overflow-hidden divide-y" style={{ border: "1px solid rgba(139,92,246,0.1)", background: "rgba(10,8,20,0.3)" }}>
          {preFilters.map((f) => (
            <div key={f.name} className="flex items-start gap-3 px-4 py-3">
              <code className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono" style={{ background: "rgba(249,115,22,0.1)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.2)" }}>
                {f.name}
              </code>
              <p className="text-xs" style={{ color: "rgba(240,238,255,0.65)" }}>{f.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Post-Selection Filters */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: "#c4b5fd" }}>
          <Shield className="h-4 w-4" />
          ポストセレクションフィルタ（選択後）
        </h2>
        <div className="rounded-xl overflow-hidden divide-y" style={{ border: "1px solid rgba(139,92,246,0.1)", background: "rgba(10,8,20,0.3)" }}>
          {postFilters.map((f) => (
            <div key={f.name} className="flex items-start gap-3 px-4 py-3">
              <code className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                {f.name}
              </code>
              <p className="text-xs" style={{ color: "rgba(240,238,255,0.65)" }}>{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ━━━━━ Tipsタブ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TipsTab() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(6,182,212,0.08))", border: "1px solid rgba(139,92,246,0.2)" }}>
        <p className="text-sm" style={{ color: "rgba(240,238,255,0.8)" }}>
          Xの公開アルゴリズムソースコード（
          <code className="text-[11px]" style={{ color: "#a78bfa" }}>weighted_scorer.rs</code>・
          <code className="text-[11px]" style={{ color: "#a78bfa" }}>recsys_model.py</code>）の分析から導いた、
          <strong style={{ color: "#e9d5ff" }}>アルゴリズムに根拠のある</strong>実戦的なTipsです。
        </p>
      </div>

      <div className="space-y-3">
        {TIPS.map((tip, i) => (
          <div key={i} className="rounded-xl overflow-hidden" style={{ background: "rgba(10,8,20,0.4)", border: "1px solid rgba(139,92,246,0.1)" }}>
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-sm font-bold" style={{ color: "rgba(240,238,255,0.9)" }}>
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-md mr-2 text-[10px] font-bold" style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd" }}>
                    {i + 1}
                  </span>
                  {tip.title}
                </h3>
                <ImpactBadge impact={tip.impact} />
              </div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: "rgba(240,238,255,0.7)" }}>
                {tip.description}
              </p>
              <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.1)" }}>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "#a78bfa" }} />
                <p className="text-[11px] leading-relaxed" style={{ color: "rgba(167,139,250,0.85)" }}>
                  <strong>アルゴリズム根拠:</strong> {tip.algorithmReason}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

