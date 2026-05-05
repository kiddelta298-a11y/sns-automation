"use client";

import { useState } from "react";
import {
  Target, Calendar, FlaskConical, Users, TrendingUp,
  CheckCircle2, AlertTriangle, Sparkles, Clock, DollarSign,
  GitBranch, HelpCircle, Compass, Wrench, Folder, KeyRound, Database, Terminal, ArrowRight,
} from "lucide-react";

// ─── 型 ───────────────────────────────────────────────
type TabKey = "devstatus" | "overview" | "funnel" | "phase1" | "phase2" | "accounts" | "kpi" | "questions";

// ─── データ定義 ───────────────────────────────────────
const PHASE1_DAYS: Array<{
  date: string; weekday: string; dev: string; ball: string;
}> = [
  { date: "4/29", weekday: "水", dev: "Story投稿コアロジック完成（画像→テキスト→リンクスタンプ）/ ローカル単体テスト", ball: "ナタリアアカウントの基本情報整備（プロフ・アイコン・ハイライト雛形）" },
  { date: "4/30", weekday: "木", dev: "リンクスタンプ＋添えテキストUI実装 / 任意位置・色設定の保存", ball: "アフィリエイトリンク 3〜5本発行（LINE系2本 / アプリ系2〜3本）" },
  { date: "5/1",  weekday: "金", dev: "画像フォルダ監視 → 投稿キュー化 / 重複投稿防止のハッシュ管理", ball: "投稿用画像 50〜100枚 を選定フォルダへ格納" },
  { date: "5/2",  weekday: "土", dev: "投稿スケジューラ（時間帯・1日上限）/ 失敗時リトライ＆通知", ball: "投稿時間帯の仮説立て（朝/昼/夜のどこに張るか方針メモ）" },
  { date: "5/3",  weekday: "日", dev: "プロキシ／Cookie永続化／2FA回避フローの安定化", ball: "別アカ用のメアド・電話番号を 10〜15個 用意（増設の備え）" },
  { date: "5/4",  weekday: "月", dev: "ナタリアでE2Eテスト（テキストのみ・画像のみ・リンク付き 各3本）", ball: "ナタリアの手動投稿を1〜2本入れて「人間味」を残す" },
  { date: "5/5",  weekday: "火", dev: "バグ修正 + ログ整備（投稿ID・遷移URL・スタンプ位置の保存）", ball: "案件LPの遷移確認・計測パラメータ（utm/sub_id）設計" },
  { date: "5/6",  weekday: "水", dev: "sub_id差し込み機能（アカウント別・投稿別にCV帰属を分離）", ball: "sub_id命名規則の合意（例：nataliya_yyyymmdd_n）" },
  { date: "5/7",  weekday: "木", dev: "ダッシュボードに Story投稿実績タブ追加（投稿数/閲覧数/タップ数）", ball: "ASP管理画面のCVデータ取り込み手順を確認（CSV or API）" },
  { date: "5/8",  weekday: "金", dev: "ASP CV取り込み（手動CSV対応）/ sub_id逆引き集計", ball: "ステージング検証用に追加2アカウントを準備（同系統）" },
  { date: "5/9",  weekday: "土", dev: "受け入れテスト → リリース判定", ball: "リリース可否レビュー / Phase2開始のGO判断" },
];

const PHASE2_WEEKS: Array<{
  week: string; range: string; focus: string; dev: string; ball: string;
}> = [
  { week: "W1", range: "5/10–5/16", focus: "母数立ち上げ", dev: "投稿頻度上限の自動制御 / シャドウバン検知（インプ急減アラート）", ball: "全アカウントのプロフ整備・初期フォロー獲得" },
  { week: "W2", range: "5/17–5/23", focus: "時間帯A/B", dev: "時間帯別パフォーマンスレポート", ball: "各時間帯に同クリエイティブを当てて差分観察" },
  { week: "W3", range: "5/24–5/30", focus: "クリエイティブA/B", dev: "画像タイプ × コピー型のクロス集計UI", ball: "勝ちパターン仮説整理 / 負けクリエイティブ差替え" },
  { week: "W4", range: "5/31–6/6",  focus: "CTAコピーA/B", dev: "リンク添えテキストの多変量テスト機能", ball: "案件(a)(b)の単価別CTR・CVRを比較" },
  { week: "W5", range: "6/7–6/13",  focus: "スケール検証", dev: "勝ちパターンを全アカウントへ自動配信", ball: "結果レビュー → Phase3 横展開判断" },
];

const VERIFY_AXES = [
  { axis: "クリエイティブ", desc: "画像タイプ（顔出し / ボディ / 日常 / ベッド）× コピー（質問形 / 共感形 / 煽り形）" },
  { axis: "時間帯",         desc: "朝(7-9) / 昼(12-13) / 夜(21-24) / 深夜(0-2)" },
  { axis: "アカウント設計", desc: "プロフ文・年齢設定・地域・ハイライト構成のA/B" },
  { axis: "CTA",            desc: "リンク添えテキスト（「DM見て」「プロフから」「無料だよ」等）× 案件(a)(b)" },
];

const KPI_LIST = [
  "インプレッション / リーチ / プロフィールアクセス",
  "リンクスタンプ タップ数（IGインサイト）",
  "ASP遷移数（sub_id単位）",
  "CV数 / CVR / eCPM",
  "アカウント別の停止/警告発生率",
];

// ─── 動線（実数値ベース） ───────────────────────────
const FUNNEL_STEPS: Array<{
  step: string; rate: string; perAcc: number; note: string;
}> = [
  { step: "① Threads月間インプ",        rate: "—",       perAcc: 1_400_000, note: "1アカウントの肌感ベース" },
  { step: "② → Instagram遷移",          rate: "0.7%",    perAcc: 9_800,     note: "プロフィール経由でIGに着地" },
  { step: "③ → Story閲覧",              rate: "100%",    perAcc: 9_800,     note: "IG遷移者は基本Storyを開く" },
  { step: "④ → LPクリック（リンクタップ）", rate: "10%",   perAcc: 980,       note: "Story内アフィリリンクをタップ" },
  { step: "⑤ → CV（DL/LINE追加）",      rate: "2.7%",    perAcc: 26.46,     note: "1アカ約26.5CV/月 = 13,230円" },
];

// ─── 目標逆算アカウント数 ─────────────────────────
const ACCOUNT_REVERSE_CALC = [
  { month: "2026-05", target: 750,   theoretical: 28.3,  recommended: "（検証期：18〜20で質優先）", status: "warn",  note: "目標未達リスクあり。検証品質を優先" },
  { month: "2026-06", target: 2000,  theoretical: 75.5,  recommended: "85〜90 アカ",           status: "ok",    note: "勝ちパターン確定後にスケール" },
  { month: "2026-07", target: 3000,  theoretical: 113.3, recommended: "130 アカ",             status: "ok",    note: "横展開の本番" },
  { month: "2026-08", target: 4000,  theoretical: 151.0, recommended: "170 アカ",             status: "ok",    note: "案件単価UPで圧縮も可" },
];

// ─── アカウント設計（A/B検証用） ─────────────────
const ACCOUNT_ROLES = [
  { role: "時間帯A/B",     count: 4,  reason: "朝・昼・夜・深夜の同条件比較に各1本" },
  { role: "クリエイティブA/B", count: 4,  reason: "画像タイプ4系統を同時並行" },
  { role: "CTAコピーA/B",  count: 2,  reason: "同案件で添えテキスト勝負を分離" },
  { role: "案件(a)(b)分離", count: 2, reason: "LINE系とアプリ系を交差汚染させない" },
  { role: "コントロール群", count: 2, reason: "仕様変更時の比較基準" },
  { role: "BAN/警告予備",   count: 8,  reason: "熟女系ネカマは凍結リスクが高い。常備" },
];

const ACCOUNT_RAMP = [
  { date: "5/10", add: 6,  total: 6,  note: "コア検証スタート" },
  { date: "5/17", add: 6,  total: 12, note: "A/B母数を倍化" },
  { date: "5/24", add: 6,  total: 18, note: "スケール & スペア" },
  { date: "6/1",  add: 70, total: 88, note: "勝ちパターン確定 → 一気にスケール（→90近辺）" },
  { date: "7/1",  add: 42, total: 130, note: "横展開・本格運用" },
  { date: "8/1",  add: 40, total: 170, note: "案件多角化に合わせ拡張" },
];

const KPI_ASSUMPTIONS = [
  { metric: "1アカ1日Story本数",  weak: 3,    mid: 5,    strong: 7 },
  { metric: "1Story平均インプ",    weak: 200,  mid: 500,  strong: 1200 },
  { metric: "リンクタップ率",      weak: "1.0%", mid: "2.5%", strong: "5.0%" },
  { metric: "ASP着地後CVR",        weak: "3%",   mid: "6%",   strong: "10%" },
];

const MONTHLY_TARGETS = [
  { month: "2026-05", accounts: "6 → 18",  cv: 750,   revenue: "37.5万円",   purpose: "検証・勝ちパターン特定" },
  { month: "2026-06", accounts: "18 → 90", cv: 2000,  revenue: "100万円",    purpose: "最適化・横展開" },
  { month: "2026-07", accounts: "130",     cv: 3000,  revenue: "150万円",    purpose: "スケール本番" },
  { month: "2026-08", accounts: "170",     cv: 4000,  revenue: "200万円",    purpose: "案件多角化（単価UP案件追加）" },
];

// ─── 戦略選択肢 ─────────────────────────────────
const STRATEGIES = [
  { key: "A", title: "アカ数で押す",       body: "6月までに90アカ立ち上げ、7月130アカ", fit: "アカ量産・プロキシ確保が現実的なら最速", color: "violet" },
  { key: "B", title: "単価を上げる",       body: "500円案件と並行で1,500〜3,000円案件を導入", fit: "必要アカ数を1/3〜1/6に圧縮可能", color: "pink" },
  { key: "C", title: "ファネル改善に賭ける", body: "IG遷移率 0.7% → 1.5% を目指す", fit: "アカ数半減できるが達成不確実", color: "amber" },
];

// ─── あなたから共有してほしい情報 ──────────────────
const QUESTIONS: Array<{
  id: number; priority: "高" | "中"; topic: string; reason: string;
}> = [
  { id: 1,  priority: "高", topic: "Threads月140万インプの **到達までの助走期間**",       reason: "新規アカが何日でトップスピードに乗るかでスケール曲線が変わる" },
  { id: 2,  priority: "中", topic: "Threads → IG遷移0.7%の **アカウント分散**",          reason: "上位20%が大半を稼ぐ／平均的に出る、で必要数が膨らむ" },
  { id: 3,  priority: "高", topic: "**アカウント生存率**（月次BAN率）",                  reason: "76アカ稼働に必要な作成数が決まる" },
  { id: 4,  priority: "中", topic: "**1日あたりStory投稿可能本数の上限**",                reason: "露出過多でタップ率10%が劣化する可能性" },
  { id: 5,  priority: "中", topic: "**過去のCVR2.7%は LINE系/アプリ系どちら寄りか**",     reason: "案件構成の最適比が変わる" },
  { id: 6,  priority: "中", topic: "LP内 **複数CV併載案件のCV発生率上振れ幅**",          reason: "強ければ必要アカ数を下げられる" },
  { id: 7,  priority: "高", topic: "Threads **アカウント作成ペース上限**（SIM・端末ごと）", reason: "5〜6月で76アカ立ち上げが物理的に間に合うか判定" },
  { id: 8,  priority: "高", topic: "**モバイルプロキシ確保の上限と単価**",                reason: "100アカ超で運用コストが利益を圧迫しないか" },
  { id: 9,  priority: "中", topic: "過去運用の **伸びた月／伸び悩んだ月の差分要因**",       reason: "季節性・案件入替・規制動向のどれが効くか" },
  { id: 10, priority: "中", topic: "Threadsアカ1つあたりの **コンテンツ回転**",            reason: "ネタ使い回し可否で制作工数が決まる" },
];

// ─── スタイル小物 ─────────────────────────────────
const card: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(20,15,35,0.85) 0%, rgba(15,12,28,0.85) 100%)",
  border: "1px solid rgba(139,92,246,0.18)",
  borderRadius: 16,
  backdropFilter: "blur(12px)",
};

const tableHeadStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.18)",
  color: "#c4b5fd",
  fontWeight: 600,
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 12,
  letterSpacing: "0.04em",
  borderBottom: "1px solid rgba(139,92,246,0.25)",
};

const tableCellStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  color: "rgba(240,238,255,0.82)",
  borderBottom: "1px solid rgba(139,92,246,0.08)",
  verticalAlign: "top",
};

// ─── ページ本体 ───────────────────────────────────
export function IgStrategyContent() {
  const [tab, setTab] = useState<TabKey>("devstatus");

  const tabs: Array<{ key: TabKey; label: string; icon: typeof Target }> = [
    { key: "devstatus", label: "実装状況",     icon: Wrench },
    { key: "overview",  label: "全体像",       icon: Sparkles },
    { key: "funnel",    label: "動線とファネル", icon: GitBranch },
    { key: "phase1",    label: "Phase1 実装",  icon: Calendar },
    { key: "phase2",    label: "Phase2 検証",  icon: FlaskConical },
    { key: "accounts",  label: "アカウント設計", icon: Users },
    { key: "kpi",       label: "目標数値",     icon: TrendingUp },
    { key: "questions", label: "確認事項",     icon: HelpCircle },
  ];

  return (
    <div className="min-h-screen px-6 py-6 md:px-10 md:py-8" style={{
      background: "radial-gradient(ellipse at top, rgba(124,58,237,0.08) 0%, transparent 60%), #07050f",
    }}>
      {/* ── ヘッダー ── */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)", boxShadow: "0 0 20px rgba(236,72,153,0.4)" }}>
              <Target className="h-5 w-5 text-white" strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{
                background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
                Instagram Story アフィリエイト中期戦略
              </h1>
              <p className="text-xs mt-1" style={{ color: "rgba(240,238,255,0.45)" }}>
                Threads → IG → Story → LP → CV / 熟女系ネカマ運用 / 案件単価500円
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip icon={Clock}        label="Phase1" value="11日間" />
          <Chip icon={FlaskConical} label="Phase2" value="5週間" />
          <Chip icon={Users}        label="6月推奨" value="85〜90" />
          <Chip icon={Users}        label="7月推奨" value="130" />
          <Chip icon={DollarSign}   label="6月目標" value="100万円" />
        </div>
      </div>

      {/* ── タブ ── */}
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all"
              style={active ? {
                background: "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(168,85,247,0.25))",
                color: "#f0abfc",
                border: "1px solid rgba(167,139,250,0.5)",
                boxShadow: "0 0 16px rgba(139,92,246,0.25)",
              } : {
                background: "rgba(20,15,35,0.6)",
                color: "rgba(240,238,255,0.55)",
                border: "1px solid rgba(139,92,246,0.15)",
              }}>
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "devstatus" && <DevStatusTab />}
      {tab === "overview"  && <OverviewTab />}
      {tab === "funnel"    && <FunnelTab />}
      {tab === "phase1"    && <Phase1Tab />}
      {tab === "phase2"    && <Phase2Tab />}
      {tab === "accounts"  && <AccountsTab />}
      {tab === "kpi"       && <KpiTab />}
      {tab === "questions" && <QuestionsTab />}
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────
function Chip({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2"
      style={{ background: "rgba(20,15,35,0.7)", border: "1px solid rgba(139,92,246,0.2)" }}>
      <Icon className="h-3.5 w-3.5" style={{ color: "#a78bfa" }} />
      <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(240,238,255,0.45)" }}>{label}</span>
      <span className="text-sm font-bold" style={{ color: "#f0abfc" }}>{value}</span>
    </div>
  );
}

// ─── Section ──────────────────────────────────────
function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 p-5 md:p-6" style={card}>
      <h2 className="text-lg font-bold mb-1" style={{ color: "#e9d5ff" }}>{title}</h2>
      {desc && <p className="text-xs mb-4" style={{ color: "rgba(240,238,255,0.5)" }}>{desc}</p>}
      {children}
    </div>
  );
}

// ─── 実装状況（明日の続き用 引き継ぎ情報） ──────────
// このタブは「データが消えても再着手できる」ように、開発状況・準備物・
// 次の指示を一箇所にまとめたもの。ターミナルで指示を出す前に必ずここを参照。
function DevStatusTab() {
  const IMAGE_DIR = "/home/himawari_pchimawari_pc/projects/sns-automation/apps/worker/data/instagram-uploads/natalia/pending";
  const IMAGE_DIR_WIN = "\\\\wsl.localhost\\Ubuntu\\home\\himawari_pchimawari_pc\\projects\\sns-automation\\apps\\worker\\data\\instagram-uploads\\natalia\\pending";

  const COMPLETED: Array<{ id: number; title: string; detail: string }> = [
    { id: 10, title: "Nataliaセッション有効性確認", detail: "instagram_natalia_r_29.json を実機で復元し isLoggedIn=true を確認済み（34日経過しても有効）" },
    { id: 11, title: "現状UIの差分把握", detail: "新UIは英語表示 + 「New post」クリック後にサブメニューが開く構造に変更されていた → SELECTORSと投稿フローを更新済み" },
    { id: 12, title: "リンク貼付方針確定", detail: "C案: フィード（プロフィール「リンクを追加」機能）+ ストーリーズ（リンクスタンプ）両対応" },
    { id: 13, title: "画像格納フォルダ作成", detail: "apps/worker/data/instagram-uploads/natalia/{pending,posted,failed}/ + README + .gitignore" },
    { id: 14, title: "DB拡張: accounts.affiliate_url / affiliate_label", detail: "マイグレーション 0005_account_affiliate.sql 適用済。NataliaのアカウントID = 01ddea8c-d76e-413d-ae57-0a179c91961a" },
    { id: 15, title: "Gemini Visionによる2行キャプション生成", detail: "apps/worker/src/jobs/generate-caption.ts 実装。GEMINI_API_KEY 設定後に有効化" },
    { id: 16, title: "instagram.ts リンク貼付フロー", detail: "_addPostLink() 新設・SELECTORS更新。InstagramPostOptions に affiliateUrl/affiliateLabel 追加" },
    { id: 17, title: "フォルダ起点の一括投稿API", detail: "POST /api/instagram/posts/from-folder, GET /api/instagram/posts/pending 実装済" },
    { id: 18, title: "投稿フローWeb UI → /threads-analysis「IG投稿」タブに統合完了", detail: "/instagram-posts ページを廃止し、/threads-analysis の「IG投稿」タブへ機能を移植。フィード+ストーリー両対応、多選択、投稿間隔・キャプション・アフィリエイト上書き対応済。" },
    { id: 19, title: "投稿後の画像移動・post_history連携", detail: "成功→posted/、失敗→failed/。post_history に post_url/image_paths カラム追加済（migration 0006）" },
  ];

  const NEXT_TASKS: Array<{ id: string; title: string; needsUser: boolean; detail: string }> = [
    { id: "P1", title: "✅ /threads-analysis 統合完了", needsUser: false, detail: "(a) Threads投稿タブ・(b) IG投稿タブ（フォルダ起点・フィード+ストーリー）を /threads-analysis に統合済。/instagram-posts は廃止。" },
    { id: "P2", title: "Threadsアカウント分析の現状確認", needsUser: true, detail: "「Threadsの投稿ができるページ」が現状未存在。新設 or 既存 /posts/new 移植 のどちらかをユーザーが決定する必要あり。" },
    { id: "P3", title: "「IGストーリー投稿」の範囲確定", needsUser: true, detail: "ストーリーのみ / フィード+ストーリー切替 のどちらにするかユーザー決定。現実装は両対応。" },
    { id: "P4", title: "GEMINI_API_KEY 設定", needsUser: true, detail: "https://aistudio.google.com/apikey で取得 → apps/worker/.env に追記（私が代行可）" },
    { id: "P5", title: "アフィリエイトURL/ラベルの本番値登録", needsUser: true, detail: "PUT /api/accounts/01ddea8c-d76e-413d-ae57-0a179c91961a/affiliate に投げる、または統合ページ完成後にUIから登録" },
    { id: "P6", title: "テスト画像配置 + E2Eドライラン", needsUser: true, detail: "pending/ に画像1枚を配置し、フィード単独で1投稿を実機検証" },
  ];

  return (
    <>
      <div className="mb-6 rounded-2xl p-5" style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(124,58,237,0.06))", border: "1px solid rgba(34,197,94,0.25)" }}>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 mt-0.5" style={{ color: "#86efac" }} />
          <div>
            <h2 className="text-base font-bold mb-2" style={{ color: "#bbf7d0" }}>
              開発進捗：10/11 タスク完了 ｜ 本日優先: P1（/threads-analysis 統合）
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(240,238,255,0.85)" }}>
              ナタリアアカウントへの自動投稿パイプラインは <strong style={{ color: "#bbf7d0" }}>実装上ほぼ完成</strong>。残る開発タスクは
              ① ページ統合（/threads-analysis にタブで合流）のみ。P2〜P6 はユーザー側の判断・準備待ち。
              <strong style={{ color: "#fde68a" }}>Phase1完了期限: 5/9。本日中にP1着手。</strong>
            </p>
          </div>
        </div>
      </div>

      <Section title="🏛️ SNSコントロールタワー全体完成スケジュール（2026-04-29 → 2026-05-31）" desc="IG投稿系は実装ほぼ完了。残るクリティカルパスは Threads 安定化 → リアルタイム監視 → AI/中期戦略タブ → 本番デプロイ">
        <div className="mb-4 rounded-xl p-4" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(167,139,250,0.25)" }}>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.78)" }}>
            <strong style={{ color: "#f0abfc" }}>前提</strong>: projects.json の進捗 87%、未完了タスク 17件、未コミット変更 76ファイル。
            IG投稿系（画像格納/アフィリンク管理/キャプション/投稿改修/設定UI）はコード上は実装済で、残るは
            <strong style={{ color: "#fde68a" }}> ページ統合 (P1) と E2E ドライラン</strong>のみ。
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(139,92,246,0.25)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 90 }}>週</th>
                <th style={{ ...tableHeadStyle, width: 130 }}>期間</th>
                <th style={{ ...tableHeadStyle, width: 220 }}>テーマ</th>
                <th style={tableHeadStyle}>主タスク</th>
                <th style={{ ...tableHeadStyle, width: 240 }}>マイルストーン</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  w: "Week 1", range: "4/29(水) – 5/3(日)",
                  theme: "Threads 自動投稿の安定化",
                  tasks: "task_045 セレクタ修正・ルートバグ・セッション保存 / task_049 watchJobCompletion DB更新バグ / task_050 platform_post_id 取得 / task_056 二重投稿+外部リンク削除 / 並行で IG ページ統合 P1（/threads-analysis にタブ追加）",
                  milestone: "Threads が「投稿→DB反映→ID記録」まで一発で通る。IG はタブで合流。",
                },
                {
                  w: "Week 2", range: "5/4(月) – 5/10(日)",
                  theme: "予約投稿リアルタイム監視",
                  tasks: "task_046 Phase2 DBマイグレ+Worker+API+SSE / task_047 Phase3 platformPostId+詳細ページ / task_043 親タスククローズ / IG E2E ドライラン（pending/ から1枚投稿）",
                  milestone: "予約投稿の進捗が画面でリアルタイム可視化、履歴で事後確認可能。",
                },
                {
                  w: "Week 3", range: "5/11(月) – 5/17(日)",
                  theme: "リサーチ→自動投稿 + AI 改善",
                  tasks: "task_057 アカウント選択+インプレッション順投稿 / 投稿改善 AI 統合（既存 Gemini 基盤を流用）",
                  milestone: "リサーチ画面から直接バズ投稿を量産投稿できる。AI 提案がUIに反映。",
                },
                {
                  w: "Week 4", range: "5/18(月) – 5/24(日)",
                  theme: "中期戦略タブ + IPブロック対策",
                  tasks: "task_063 中期戦略タブ新設（ロードマップ+KPI+月次目標） / task_042 Threadsスクレイピング IPブロック回避（プロキシ/Residential検証）",
                  milestone: "機能フリーズ。以降はバグFixのみ。",
                },
                {
                  w: "Week 5", range: "5/25(月) – 5/31(日)",
                  theme: "本番デプロイ・受入",
                  tasks: "5/25-27: 滞留76ファイルの分割コミット・PR化 / 5/28: Vercel(Web)+Render(API/Worker)本番反映+環境変数最終チェック / 5/29-30: 本番疎通テスト / 5/31: 完了判定+リリースノート",
                  milestone: "v1.0 本番リリース完了。",
                },
              ].map((r, i) => (
                <tr key={r.w} style={{ background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.04)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 700, color: "#f0abfc" }}>{r.w}</td>
                  <td style={{ ...tableCellStyle, fontSize: 12, color: "rgba(240,238,255,0.7)" }}>{r.range}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 600, color: "#c4b5fd" }}>{r.theme}</td>
                  <td style={{ ...tableCellStyle, fontSize: 12 }}>{r.tasks}</td>
                  <td style={{ ...tableCellStyle, fontSize: 12, color: "#bbf7d0" }}>{r.milestone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 rounded-xl p-3" style={{ background: "rgba(244,114,182,0.05)", border: "1px solid rgba(244,114,182,0.2)" }}>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.75)" }}>
            <strong style={{ color: "#fda4af" }}>クリティカルパス</strong>: Week 1 が最重要。Threads バグFixが片付かないと Week 2 SSE 実装が砂上の楼閣になる。
            5/3 までに収束しなければ task_042（IPブロック回避）と AI 統合を Week 5 に後ろ倒し or スコープアウトを検討。
          </p>
        </div>
      </Section>

      <Section title="① 画像を置く場所" desc="ここに画像を入れるだけで投稿対象になる">
        <div className="space-y-3">
          <InfoRow icon={Folder} label="WSL上の絶対パス（ターミナル/コード用）">
            <code style={codeStyle}>{IMAGE_DIR}</code>
          </InfoRow>
          <InfoRow icon={Folder} label="Windowsエクスプローラーで開く（推奨）">
            <code style={codeStyle}>{IMAGE_DIR_WIN}</code>
            <p className="text-xs mt-2" style={{ color: "rgba(240,238,255,0.6)" }}>
              ※ Windowsエクスプローラーのアドレスバーに上記を貼り付けてEnter。<br />
              ※ ディストリビューション名「Ubuntu」が違う場合はターミナルで <code style={inlineCodeStyle}>wsl -l -v</code> を実行して確認。
            </p>
          </InfoRow>
          <InfoRow icon={Folder} label="サブディレクトリ構成">
            <ul className="text-xs space-y-1" style={{ color: "rgba(240,238,255,0.75)" }}>
              <li><code style={inlineCodeStyle}>pending/</code> — 投稿待ち画像を置く場所（ここに置く）</li>
              <li><code style={inlineCodeStyle}>posted/</code>  — 投稿成功時に自動で移動される</li>
              <li><code style={inlineCodeStyle}>failed/</code>  — 投稿失敗時に自動で移動される</li>
            </ul>
          </InfoRow>
          <InfoRow icon={Folder} label="画像要件">
            <ul className="text-xs space-y-1" style={{ color: "rgba(240,238,255,0.75)" }}>
              <li>対応拡張子: <code style={inlineCodeStyle}>.jpg / .jpeg / .png</code></li>
              <li>推奨解像度: 1080×1080以上（正方形推奨）</li>
              <li>ファイル名は任意（半角英数字推奨）</li>
            </ul>
          </InfoRow>
        </div>
      </Section>

      <Section title="② Gemini APIキーとは（任意・推奨設定）" desc="画像から2行キャプションをAIが自動生成するための鍵">
        <div className="space-y-3">
          <InfoRow icon={KeyRound} label="Geminiとは">
            <p className="text-sm" style={{ color: "rgba(240,238,255,0.85)" }}>
              Googleが提供するAI（ChatGPTのライバル）。今回は「画像を見せて2行のキャプションを書いて」とAIに依頼するために使う。
              無料枠（1日1500リクエスト）で十分。
            </p>
          </InfoRow>
          <InfoRow icon={KeyRound} label="取得方法（約3分）">
            <ol className="text-xs space-y-1 list-decimal list-inside" style={{ color: "rgba(240,238,255,0.75)" }}>
              <li><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: "#a78bfa", textDecoration: "underline" }}>https://aistudio.google.com/apikey</a> にアクセス（Googleログイン）</li>
              <li>「Create API Key」ボタンをクリック</li>
              <li>表示された <code style={inlineCodeStyle}>AIzaSy...</code> で始まる文字列をコピー</li>
              <li>そのまま開発担当（Claude）に渡す → 私が <code style={inlineCodeStyle}>apps/worker/.env</code> に設定</li>
            </ol>
          </InfoRow>
          <InfoRow icon={KeyRound} label="設定しなかった場合の挙動">
            <p className="text-sm" style={{ color: "rgba(240,238,255,0.85)" }}>
              キャプションが空欄のまま投稿される（投稿自体は成功）。
              meta.json または UI で手動キャプションを入れれば代替可能。
            </p>
          </InfoRow>
        </div>
      </Section>

      <Section title="③ 完了タスク一覧" desc="全部できているので、もう1度やる必要はない">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 50 }}>#</th>
                <th style={{ ...tableHeadStyle, width: 280 }}>タスク</th>
                <th style={tableHeadStyle}>詳細</th>
              </tr>
            </thead>
            <tbody>
              {COMPLETED.map((t, i) => (
                <tr key={t.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(34,197,94,0.04)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 700, color: "#86efac", textAlign: "center" }}>{t.id}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 600, color: "#bbf7d0" }}>
                    <span style={{ color: "#86efac" }}>✓</span> {t.title}
                  </td>
                  <td style={{ ...tableCellStyle, fontSize: 12 }}>{t.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="④ 残タスク（明日の続き）" desc="開発側 / ユーザー判断が必要なものを明示">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(251,191,36,0.25)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 50 }}>ID</th>
                <th style={{ ...tableHeadStyle, width: 280 }}>タスク</th>
                <th style={{ ...tableHeadStyle, width: 100, textAlign: "center" }}>区分</th>
                <th style={tableHeadStyle}>内容 / 必要な判断</th>
              </tr>
            </thead>
            <tbody>
              {NEXT_TASKS.map((t, i) => (
                <tr key={t.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(251,191,36,0.04)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 700, color: "#fde68a", textAlign: "center" }}>{t.id}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 600, color: "#fef3c7" }}>{t.title}</td>
                  <td style={{ ...tableCellStyle, textAlign: "center" }}>
                    {t.needsUser ? (
                      <span style={{ color: "#fda4af", fontWeight: 700, fontSize: 11 }}>ユーザー判断</span>
                    ) : (
                      <span style={{ color: "#86efac", fontWeight: 700, fontSize: 11 }}>開発側</span>
                    )}
                  </td>
                  <td style={{ ...tableCellStyle, fontSize: 12 }}>{t.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="⑤ ページ統合 ✅ 完了" desc="/threads-analysis に3タブ統合済み（2026-04-29）">
        <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)" }}>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(240,238,255,0.9)" }}>
            <strong style={{ color: "#bbf7d0" }}>/threads-analysis</strong> に3タブを統合完了:
          </p>
          <ul className="mt-3 text-sm space-y-2" style={{ color: "rgba(240,238,255,0.8)" }}>
            <li>(1) <strong style={{ color: "#86efac" }}>Threadsアカウント分析</strong> — 既存の分析機能（そのまま）</li>
            <li>(2) <strong style={{ color: "#86efac" }}>Threads投稿</strong> — 下書き保存・予約投稿作成</li>
            <li>(3) <strong style={{ color: "#86efac" }}>IG投稿</strong> — フォルダ起点・フィード+ストーリー両対応・多選択・Geminiキャプション・アフィリエイトURL管理</li>
          </ul>
          <p className="mt-3 text-xs" style={{ color: "rgba(240,238,255,0.55)" }}>
            廃止済み: <code style={inlineCodeStyle}>/instagram-posts</code>、<code style={inlineCodeStyle}>/posts/story</code>
          </p>
        </div>
      </Section>

      <Section title="⑥ DB情報・APIエンドポイント早見表" desc="開発再開時に参照する重要情報">
        <div className="space-y-3">
          <InfoRow icon={Database} label="NataliaアカウントID（accountsテーブル）">
            <code style={codeStyle}>01ddea8c-d76e-413d-ae57-0a179c91961a</code>
          </InfoRow>
          <InfoRow icon={Database} label="Instagram認証情報">
            <code style={codeStyle}>username: natalia_r_29 / password: lovelovelove</code>
            <p className="text-xs mt-1" style={{ color: "rgba(240,238,255,0.55)" }}>
              ※ apps/worker/.env の INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD
            </p>
          </InfoRow>
          <InfoRow icon={Database} label="アフィリエイトURL/ラベルを設定するAPI">
            <code style={codeStyle}>{`PUT http://localhost:3000/api/accounts/01ddea8c-d76e-413d-ae57-0a179c91961a/affiliate
Body: { "affiliateUrl": "https://...", "affiliateLabel": "詳しくはこちら" }`}</code>
          </InfoRow>
          <InfoRow icon={Database} label="フォルダ起点投稿API">
            <code style={codeStyle}>{`POST http://localhost:3000/api/instagram/posts/from-folder
Body: { "account": "natalia_r_29", "modes": ["feed"], "intervalSec": 60 }`}</code>
          </InfoRow>
          <InfoRow icon={Database} label="pending画像一覧API">
            <code style={codeStyle}>GET http://localhost:3000/api/instagram/posts/pending?account=natalia_r_29</code>
          </InfoRow>
          <InfoRow icon={Database} label="セッションファイル">
            <code style={codeStyle}>apps/worker/data/sessions/instagram_natalia_r_29.json</code>
          </InfoRow>
        </div>
      </Section>

      <Section title="⑦ 明日、開発再開時の指示の出し方" desc="ターミナル（Claude Code）で叩くだけで続きから再開できる">
        <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(20,15,35,0.7)", border: "1px solid rgba(167,139,250,0.3)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="h-4 w-4" style={{ color: "#a78bfa" }} />
            <strong style={{ color: "#c4b5fd", fontSize: 13 }}>パターン1: ページ統合作業から始める（推奨）</strong>
          </div>
          <code style={codeStyle}>
{`「IG中期戦略の実装状況タブを見て、⑤ページ統合の方針に従って
 /threads-analysis にタブUIを追加してください。
 確認待ち事項(1)は新設、(2)はフィード+ストーリー両対応、
 (3)は両方廃止して統合先に移してください」`}
          </code>
        </div>

        <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(20,15,35,0.7)", border: "1px solid rgba(167,139,250,0.3)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="h-4 w-4" style={{ color: "#a78bfa" }} />
            <strong style={{ color: "#c4b5fd", fontSize: 13 }}>パターン2: E2Eドライランから始める</strong>
          </div>
          <code style={codeStyle}>
{`「pending/ にテスト画像を置きました。
 GEMINI_API_KEY は AIzaSy... です（または未設定のままで）。
 フィード単独で1枚だけE2Eドライランを実行してください」`}
          </code>
        </div>

        <div className="rounded-xl p-4" style={{ background: "rgba(20,15,35,0.7)", border: "1px solid rgba(167,139,250,0.3)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="h-4 w-4" style={{ color: "#a78bfa" }} />
            <strong style={{ color: "#c4b5fd", fontSize: 13 }}>サービス起動コマンド（毎朝必要なら）</strong>
          </div>
          <code style={codeStyle}>
{`cd ~/projects/sns-automation && pnpm dev
# Web: http://localhost:3004 / API: http://localhost:3000
# 内閣マルチエージェント: cd ~/multi-agent-cabinet && ./cabinet_start.sh --no-chat`}
          </code>
        </div>
      </Section>

      <Section title="⑧ 重要ファイルパス（明日の作業で触るところ）">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 280 }}>役割</th>
                <th style={tableHeadStyle}>パス</th>
              </tr>
            </thead>
            <tbody>
              {[
                { role: "Instagram投稿ロジック（フィード+リンク追加）", path: "apps/worker/src/browser/instagram.ts" },
                { role: "投稿Worker（feed/story切替・画像移動）", path: "apps/worker/src/jobs/post-to-instagram.ts" },
                { role: "Geminiキャプション生成", path: "apps/worker/src/jobs/generate-caption.ts" },
                { role: "投稿API（フォルダ起点）", path: "apps/api/src/routes/instagram-posts.ts" },
                { role: "アカウント管理API（affiliate含む）", path: "apps/api/src/routes/accounts.ts" },
                { role: "IG投稿 + Threads投稿 + アカウント分析（統合済み）", path: "apps/web/src/app/threads-analysis/page.tsx" },
                { role: "DBスキーマ", path: "apps/api/src/db/schema.ts" },
                { role: "最新マイグレーション", path: "apps/api/src/db/migrations/0006_post_history_url.sql" },
                { role: "本ドキュメント（このページ）", path: "apps/web/src/app/ig-strategy/page.tsx" },
              ].map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.03)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 600, color: "#c4b5fd" }}>{r.role}</td>
                  <td style={tableCellStyle}><code style={inlineCodeStyle}>{r.path}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="rounded-2xl p-5 mt-6" style={{ background: "linear-gradient(135deg, rgba(244,114,182,0.06), rgba(124,58,237,0.06))", border: "1px solid rgba(167,139,250,0.3)" }}>
        <div className="flex items-start gap-3">
          <ArrowRight className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#f0abfc" }} />
          <div>
            <p className="text-sm font-bold mb-1" style={{ color: "#f0abfc" }}>次の一手（明日の最初）</p>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(240,238,255,0.85)" }}>
              ⑦の「パターン1」をターミナルに貼り付け → /threads-analysis 統合を実装 →
              統合ページからアフィリエイトURL/ラベルを登録 → ⑦の「パターン2」でE2Eドライラン。
              この順番が最も手戻りが少ない。
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

const codeStyle: React.CSSProperties = {
  display: "block",
  background: "rgba(15,12,28,0.85)",
  color: "#bbf7d0",
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  wordBreak: "break-all",
  whiteSpace: "pre-wrap",
  border: "1px solid rgba(139,92,246,0.2)",
};

const inlineCodeStyle: React.CSSProperties = {
  background: "rgba(15,12,28,0.85)",
  color: "#fde68a",
  padding: "2px 6px",
  borderRadius: 4,
  fontSize: 11,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

function InfoRow({ icon: Icon, label, children }: { icon: typeof Target; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(124,58,237,0.05)", border: "1px solid rgba(139,92,246,0.15)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5" style={{ color: "#a78bfa" }} />
        <span className="text-xs font-semibold" style={{ color: "#c4b5fd" }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

// ─── 全体像 ─────────────────────────────────────
function OverviewTab() {
  return (
    <>
      <Section title="戦略サマリ" desc="3行でわかる中期戦略の全体像">
        <div className="grid gap-3 md:grid-cols-3">
          <Pillar n="1" title="Phase1: 実装完了" body="2026-04-29 〜 05-09 の11日間。ナタリア1アカで「画像→投稿→sub_id付与→CV計測」が手放しで1サイクル回る状態を作る。" />
          <Pillar n="2" title="Phase2: 検証" body="05-10 〜 06-13 の5週間。クリエイティブ × 時間帯 × アカ設計 × CTA の4軸を同時A/Bで回し、勝ちパターンを特定。" />
          <Pillar n="3" title="Phase3: スケール" body="06中旬以降。勝ちパターンを 90 → 130 → 170アカ に段階横展開し、6月100万 / 7月150万 / 8月200万を狙う。" />
        </div>
      </Section>

      <Section title="案件前提" desc="現在発行可能な案件のスペック">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <Row k="報酬単価" v="500円 / CV（メイン案件）" />
            <Row k="案件タイプ (a)" v="公式LINE登録：CTA → LINE登録完了でCV発生" />
            <Row k="案件タイプ (b)" v="アプリインストール：LP/アプリストア → インストール完了でCV発生（複数CV併載LP含む）" />
            <Row k="ASP状態" v="登録済み・リンクいつでも発行可" />
          </tbody>
        </table>
      </Section>

      <Section title="運用方針" desc="アカウントとコンテンツの方向性">
        <div className="grid gap-3 md:grid-cols-2">
          <Bullet icon={CheckCircle2} title="投稿の自動収集" body="あなたが選定した複数の熟女系アカウントから投稿を自動抽出し、画像フォルダへ格納。" />
          <Bullet icon={CheckCircle2} title="アカウント設定" body="運用アカウントも熟女系ネカマに統一。プロフ・年齢・地域・ハイライト構成までA/Bで検証。" />
        </div>
      </Section>

      <Section title="リスク注意" desc="この領域固有の凍結要因">
        <div className="rounded-xl p-4" style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)" }}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#f43f5e" }} />
            <p className="text-sm leading-relaxed" style={{ color: "rgba(240,238,255,0.85)" }}>
              熟女系・ネカマ・アフィリエイトリンクの3点セットは Meta側のシグナルで凍結率が上がる領域。
              <span className="font-bold" style={{ color: "#fda4af" }}> 1アカウント = 1モバイルプロキシ </span>
              を原則とし、最初から BAN予備アカ を多めに用意してください。
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

function Pillar({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
      <div className="flex h-7 w-7 items-center justify-center rounded-lg mb-3"
        style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "white", fontWeight: 700, fontSize: 12 }}>
        {n}
      </div>
      <h3 className="text-sm font-bold mb-2" style={{ color: "#e9d5ff" }}>{title}</h3>
      <p className="text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.7)" }}>{body}</p>
    </div>
  );
}

function Bullet({ icon: Icon, title, body }: { icon: typeof Target; title: string; body: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4" style={{ color: "#86efac" }} />
        <h3 className="text-sm font-bold" style={{ color: "#bbf7d0" }}>{title}</h3>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.7)" }}>{body}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td style={{ ...tableCellStyle, width: "32%", fontWeight: 600, color: "#c4b5fd" }}>{k}</td>
      <td style={tableCellStyle}>{v}</td>
    </tr>
  );
}

// ─── 動線とファネル ───────────────────────────────
function FunnelTab() {
  const cv1acc = 26.46;
  const rev1acc = cv1acc * 500;

  return (
    <>
      <Section title="導線フロー" desc="Threads → IG → Story → LP → CV の一連の流れ">
        <div className="space-y-3">
          {[
            { n: 1, label: "Threadsで投稿", body: "選定した熟女系アカからの投稿を自動収集 → 自動投稿" },
            { n: 2, label: "投稿 → プロフィール閲覧", body: "(a) フォロー等のエンゲージメント獲得 / (b) プロフからInstagramへ遷移" },
            { n: 3, label: "Instagramでストーリー閲覧", body: "IG着地者は基本Storyを開く" },
            { n: 4, label: "Story内のアフィリエイトリンクをタップ", body: "誘導画像 + 添えテキストでLPへ誘導" },
            { n: 5, label: "LPから各遷移先で完了", body: "アプリストアでDL / 公式LINE登録 → CV発生" },
          ].map((s) => (
            <div key={s.n} className="flex items-start gap-3 rounded-xl p-3"
              style={{ background: "rgba(124,58,237,0.05)", border: "1px solid rgba(139,92,246,0.12)" }}>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "white", fontWeight: 700, fontSize: 12 }}>
                {s.n}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#e9d5ff" }}>{s.label}</p>
                <p className="text-xs mt-1" style={{ color: "rgba(240,238,255,0.6)" }}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="ファネル数値（1アカウント月次 / 過去運用の肌感ベース）" desc="各段階の歩留まりと残人数">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={tableHeadStyle}>段階</th>
                <th style={{ ...tableHeadStyle, width: 100, textAlign: "center" }}>歩留まり</th>
                <th style={{ ...tableHeadStyle, width: 140, textAlign: "right" }}>1アカ月次</th>
                <th style={tableHeadStyle}>備考</th>
              </tr>
            </thead>
            <tbody>
              {FUNNEL_STEPS.map((s, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.03)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 600, color: "#c4b5fd" }}>{s.step}</td>
                  <td style={{ ...tableCellStyle, textAlign: "center", fontWeight: 600, color: "#86efac" }}>{s.rate}</td>
                  <td style={{ ...tableCellStyle, textAlign: "right", fontWeight: 700, color: "#f0abfc" }}>{s.perAcc.toLocaleString()}</td>
                  <td style={tableCellStyle}>{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SummaryBox label="1アカウント 月次CV"     value={`${cv1acc.toFixed(1)} CV`} />
          <SummaryBox label="1アカウント 月次売上" value={`${rev1acc.toLocaleString()} 円`} accent />
        </div>
      </Section>

      <Section title="目標逆算：必要アカウント数" desc="月別目標CVから算出（1アカ26.5CV/月で割戻）">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 110 }}>月</th>
                <th style={{ ...tableHeadStyle, width: 100, textAlign: "right" }}>CV目標</th>
                <th style={{ ...tableHeadStyle, width: 130, textAlign: "right" }}>理論アカ数</th>
                <th style={{ ...tableHeadStyle, width: 180 }}>余裕込み推奨</th>
                <th style={tableHeadStyle}>備考</th>
              </tr>
            </thead>
            <tbody>
              {ACCOUNT_REVERSE_CALC.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.03)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 700, color: "#a78bfa" }}>{r.month}</td>
                  <td style={{ ...tableCellStyle, textAlign: "right", fontWeight: 600, color: "#f0abfc" }}>{r.target.toLocaleString()}</td>
                  <td style={{ ...tableCellStyle, textAlign: "right" }}>{r.theoretical.toFixed(1)}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 700, color: r.status === "warn" ? "#fda4af" : "#86efac" }}>{r.recommended}</td>
                  <td style={tableCellStyle}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.6)" }}>
          ※ 余裕込み = BAN/シャドバン・季節変動・新規アカの助走期間（Threadsが月140万インプに到達するまで）を考慮した <strong style={{ color: "#c4b5fd" }}>+10〜15%</strong> バッファ。
        </p>
      </Section>

      <Section title="戦略の選択肢" desc="目標必達のためのアプローチ。推奨はA + B のハイブリッド">
        <div className="grid gap-3 md:grid-cols-3">
          {STRATEGIES.map((s) => {
            const colors = s.color === "violet"
              ? { bg: "rgba(124,58,237,0.1)",  border: "rgba(167,139,250,0.4)", title: "#c4b5fd" }
              : s.color === "pink"
              ? { bg: "rgba(236,72,153,0.1)",  border: "rgba(244,114,182,0.4)", title: "#f9a8d4" }
              : { bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.35)", title: "#fde68a" };
            return (
              <div key={s.key} className="rounded-xl p-4"
                style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold"
                    style={{ background: colors.border, color: "#0f0f1c" }}>{s.key}</span>
                  <h3 className="text-sm font-bold" style={{ color: colors.title }}>{s.title}</h3>
                </div>
                <p className="text-xs mb-2" style={{ color: "rgba(240,238,255,0.78)" }}>{s.body}</p>
                <p className="text-[11px]" style={{ color: "rgba(240,238,255,0.5)" }}>→ {s.fit}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 rounded-xl p-4"
          style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)" }}>
          <div className="flex items-start gap-3">
            <Compass className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#86efac" }} />
            <p className="text-sm leading-relaxed" style={{ color: "rgba(240,238,255,0.9)" }}>
              <span style={{ color: "#bbf7d0", fontWeight: 700 }}>推奨：A + B のハイブリッド</span>。
              6月に90アカでベースを確保しつつ、高単価案件を追加して7月以降のアカ増を緩和。Cは博打要素が大きいため Phase2の検証結果次第で取り入れるか判断。
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

function SummaryBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{
      background: accent ? "rgba(236,72,153,0.1)" : "rgba(124,58,237,0.1)",
      border: `1px solid ${accent ? "rgba(244,114,182,0.4)" : "rgba(167,139,250,0.4)"}`,
    }}>
      <p className="text-xs mb-2" style={{ color: "rgba(240,238,255,0.55)" }}>{label}</p>
      <p className="text-2xl font-bold" style={{
        background: accent ? "linear-gradient(135deg, #f9a8d4, #fda4af)" : "linear-gradient(135deg, #c4b5fd, #f0abfc)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}>{value}</p>
    </div>
  );
}

// ─── Phase1 ─────────────────────────────────────
function Phase1Tab() {
  return (
    <>
      <Section title="Phase1: 実装完了までの日別スケジュール" desc="2026-04-29 〜 05-09 / 11日間">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 80 }}>日付</th>
                <th style={{ ...tableHeadStyle, width: 50 }}>曜日</th>
                <th style={tableHeadStyle}>開発側タスク</th>
                <th style={tableHeadStyle}>あなた（ボール）</th>
              </tr>
            </thead>
            <tbody>
              {PHASE1_DAYS.map((d, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.03)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 600, color: "#a78bfa" }}>{d.date}</td>
                  <td style={tableCellStyle}>{d.weekday}</td>
                  <td style={tableCellStyle}>{d.dev}</td>
                  <td style={tableCellStyle}>{d.ball}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Phase1 完了条件">
        <div className="rounded-xl p-4" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#86efac" }} />
            <p className="text-sm leading-relaxed" style={{ color: "rgba(240,238,255,0.9)" }}>
              ナタリアで「<span style={{ color: "#bbf7d0", fontWeight: 600 }}>画像 → テキスト → リンク → 添えテキスト → 投稿 → sub_id付与 → CV計測</span>」が、
              人の手を触れず1サイクル回る状態。
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

// ─── Phase2 ─────────────────────────────────────
function Phase2Tab() {
  return (
    <>
      <Section title="Phase2: 検証期間 週次スケジュール" desc="2026-05-10 〜 06-13 / 5週間">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 50 }}>週</th>
                <th style={{ ...tableHeadStyle, width: 110 }}>期間</th>
                <th style={{ ...tableHeadStyle, width: 130 }}>フォーカス</th>
                <th style={tableHeadStyle}>開発側</th>
                <th style={tableHeadStyle}>あなたのタスク</th>
              </tr>
            </thead>
            <tbody>
              {PHASE2_WEEKS.map((w, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.03)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 700, color: "#f0abfc" }}>{w.week}</td>
                  <td style={tableCellStyle}>{w.range}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 600, color: "#c4b5fd" }}>{w.focus}</td>
                  <td style={tableCellStyle}>{w.dev}</td>
                  <td style={tableCellStyle}>{w.ball}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="検証の柱（4軸）" desc="同時並行で回すA/Bテスト軸">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 200 }}>軸</th>
                <th style={tableHeadStyle}>内容</th>
              </tr>
            </thead>
            <tbody>
              {VERIFY_AXES.map((a, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.03)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 600, color: "#c4b5fd" }}>{a.axis}</td>
                  <td style={tableCellStyle}>{a.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="計測KPI">
        <ul className="space-y-2">
          {KPI_LIST.map((k, i) => (
            <li key={i} className="flex items-start gap-3 text-sm" style={{ color: "rgba(240,238,255,0.85)" }}>
              <span className="mt-1 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#a78bfa" }} />
              {k}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

// ─── アカウント設計 ────────────────────────────────
function AccountsTab() {
  const totalCore = ACCOUNT_ROLES.slice(0, 5).reduce((sum, r) => sum + r.count, 0);
  const totalAll  = ACCOUNT_ROLES.reduce((sum, r) => sum + r.count, 0);

  return (
    <>
      <Section title="検証フェーズの必要アカウント数（A/B用）" desc="勝ちパターンを掴む最小ライン + 安全運用バッファ">
        <div className="grid gap-3 md:grid-cols-2 mb-5">
          <div className="rounded-xl p-5" style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(167,139,250,0.4)" }}>
            <p className="text-xs mb-2" style={{ color: "rgba(240,238,255,0.55)" }}>検証最小ライン</p>
            <p className="text-3xl font-bold" style={{
              background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>{totalCore} アカウント</p>
            <p className="text-xs mt-2" style={{ color: "rgba(240,238,255,0.6)" }}>A/B母数として最低限必要</p>
          </div>
          <div className="rounded-xl p-5" style={{ background: "rgba(236,72,153,0.12)", border: "1px solid rgba(244,114,182,0.4)" }}>
            <p className="text-xs mb-2" style={{ color: "rgba(240,238,255,0.55)" }}>検証期 安全運用込み</p>
            <p className="text-3xl font-bold" style={{
              background: "linear-gradient(135deg, #f9a8d4, #fda4af)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>{totalAll} アカウント</p>
            <p className="text-xs mt-2" style={{ color: "rgba(240,238,255,0.6)" }}>BAN/警告予備を含む推奨数（〜5月末）</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 200 }}>役割</th>
                <th style={{ ...tableHeadStyle, width: 80 }}>数</th>
                <th style={tableHeadStyle}>理由</th>
              </tr>
            </thead>
            <tbody>
              {ACCOUNT_ROLES.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.03)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 600, color: "#c4b5fd" }}>{r.role}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 700, color: "#f0abfc", textAlign: "center" }}>{r.count}</td>
                  <td style={tableCellStyle}>{r.reason}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "rgba(124,58,237,0.15)" }}>
                <td style={{ ...tableCellStyle, fontWeight: 700, color: "#e9d5ff" }}>合計（推奨）</td>
                <td style={{ ...tableCellStyle, fontWeight: 700, color: "#f0abfc", textAlign: "center" }}>{totalAll}</td>
                <td style={tableCellStyle}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      <Section title="目標CV逆算と検証用の関係（重要）" desc="目的が違うため両方が必要">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl p-4" style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
            <p className="text-xs mb-2" style={{ color: "rgba(240,238,255,0.55)" }}>① A/B検証用</p>
            <p className="text-base font-bold mb-2" style={{ color: "#c4b5fd" }}>18〜20アカ</p>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.7)" }}>
              統計的に勝ちパターンを判別するための母数。5月の検証期に必要。売上は副産物で目標未達OK。
            </p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "rgba(236,72,153,0.08)", border: "1px solid rgba(244,114,182,0.25)" }}>
            <p className="text-xs mb-2" style={{ color: "rgba(240,238,255,0.55)" }}>② 売上目標逆算</p>
            <p className="text-base font-bold mb-2" style={{ color: "#f9a8d4" }}>6月90 / 7月130 / 8月170</p>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(240,238,255,0.7)" }}>
              月次CV目標から1アカ26.5CV/月で割戻した稼働数。Phase3スケールで必要。
            </p>
          </div>
        </div>
      </Section>

      <Section title="段階的投入スケジュール（最新）" desc="検証期 → スケール期で大きく数が変わる">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 100 }}>日付</th>
                <th style={{ ...tableHeadStyle, width: 100, textAlign: "right" }}>追加</th>
                <th style={{ ...tableHeadStyle, width: 100, textAlign: "right" }}>累計</th>
                <th style={tableHeadStyle}>備考</th>
              </tr>
            </thead>
            <tbody>
              {ACCOUNT_RAMP.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.03)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 600, color: "#a78bfa" }}>{r.date}</td>
                  <td style={{ ...tableCellStyle, color: "#86efac", textAlign: "right" }}>+{r.add}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 700, color: "#f0abfc", textAlign: "right" }}>{r.total}</td>
                  <td style={tableCellStyle}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

// ─── 目標数値 ─────────────────────────────────────
function KpiTab() {
  return (
    <>
      <Section title="数値モデル前提（弱気 / 中位 / 強気）" desc="業界一般値ベースの3シナリオ">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={tableHeadStyle}>指標</th>
                <th style={{ ...tableHeadStyle, width: 100, textAlign: "center" }}>弱気</th>
                <th style={{ ...tableHeadStyle, width: 100, textAlign: "center", color: "#f0abfc" }}>中位（基準）</th>
                <th style={{ ...tableHeadStyle, width: 100, textAlign: "center" }}>強気</th>
              </tr>
            </thead>
            <tbody>
              {KPI_ASSUMPTIONS.map((k, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.03)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 600, color: "#c4b5fd" }}>{k.metric}</td>
                  <td style={{ ...tableCellStyle, textAlign: "center", color: "rgba(240,238,255,0.6)" }}>{k.weak}</td>
                  <td style={{ ...tableCellStyle, textAlign: "center", fontWeight: 700, color: "#f0abfc" }}>{k.mid}</td>
                  <td style={{ ...tableCellStyle, textAlign: "center", color: "#86efac" }}>{k.strong}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="月別マイルストーン目標" desc="あなたの肌感ファネル（1アカ26.5CV/月）でアカ数を更新">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 110 }}>月</th>
                <th style={{ ...tableHeadStyle, width: 120 }}>アカ数</th>
                <th style={{ ...tableHeadStyle, width: 110, textAlign: "right" }}>CV目標</th>
                <th style={{ ...tableHeadStyle, width: 130, textAlign: "right" }}>売上目標</th>
                <th style={tableHeadStyle}>主目的</th>
              </tr>
            </thead>
            <tbody>
              {MONTHLY_TARGETS.map((m, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.03)" }}>
                  <td style={{ ...tableCellStyle, fontWeight: 700, color: "#a78bfa" }}>{m.month}</td>
                  <td style={tableCellStyle}>{m.accounts}</td>
                  <td style={{ ...tableCellStyle, textAlign: "right", fontWeight: 600, color: "#f0abfc" }}>{m.cv.toLocaleString()} CV</td>
                  <td style={{ ...tableCellStyle, textAlign: "right", fontWeight: 700, color: "#86efac" }}>{m.revenue}</td>
                  <td style={tableCellStyle}>{m.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="運用スタンス">
        <div className="rounded-xl p-4" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)" }}>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(240,238,255,0.85)" }}>
            <span style={{ color: "#fde68a", fontWeight: 700 }}>中位想定を基準計画</span> として運用し、
            <span style={{ color: "#86efac", fontWeight: 600 }}>強気値は上振れ</span>、
            <span style={{ color: "#fda4af", fontWeight: 600 }}>弱気値はBAN多発時のセーフティライン</span> として
            3本立てで管理することを強く推奨します。
          </p>
        </div>
      </Section>
    </>
  );
}

// ─── 確認事項（あなたから共有してほしい情報） ──────
function QuestionsTab() {
  const high = QUESTIONS.filter((q) => q.priority === "高");
  const mid  = QUESTIONS.filter((q) => q.priority === "中");

  return (
    <>
      <Section title="あなたから共有してほしい情報" desc="戦略の精度を上げるために確認したい10項目">
        <div className="rounded-xl p-4 mb-5" style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(240,238,255,0.85)" }}>
            特に <span style={{ color: "#fda4af", fontWeight: 700 }}>優先度「高」の4項目（#1, #3, #7, #8）</span> は
            5月のアカ準備計画に直結します。先にこの4つだけでも教えてもらえれば、本ページの数値モデルを実数値ベースに更新します。
          </p>
        </div>

        <h3 className="text-sm font-bold mb-3" style={{ color: "#fda4af" }}>優先度「高」（先に教えてほしい）</h3>
        <div className="overflow-x-auto rounded-xl mb-5" style={{ border: "1px solid rgba(244,63,94,0.25)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 50, textAlign: "center" }}>#</th>
                <th style={tableHeadStyle}>確認項目</th>
                <th style={tableHeadStyle}>必要な理由</th>
              </tr>
            </thead>
            <tbody>
              {high.map((q, i) => (
                <tr key={q.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(244,63,94,0.04)" }}>
                  <td style={{ ...tableCellStyle, textAlign: "center", fontWeight: 700, color: "#fda4af" }}>{q.id}</td>
                  <td style={tableCellStyle} dangerouslySetInnerHTML={{ __html: q.topic.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f0abfc">$1</strong>') }} />
                  <td style={{ ...tableCellStyle, color: "rgba(240,238,255,0.65)" }}>{q.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-sm font-bold mb-3" style={{ color: "#c4b5fd" }}>優先度「中」（後追いでOK）</h3>
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tableHeadStyle, width: 50, textAlign: "center" }}>#</th>
                <th style={tableHeadStyle}>確認項目</th>
                <th style={tableHeadStyle}>必要な理由</th>
              </tr>
            </thead>
            <tbody>
              {mid.map((q, i) => (
                <tr key={q.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.03)" }}>
                  <td style={{ ...tableCellStyle, textAlign: "center", fontWeight: 600, color: "#a78bfa" }}>{q.id}</td>
                  <td style={tableCellStyle} dangerouslySetInnerHTML={{ __html: q.topic.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#c4b5fd">$1</strong>') }} />
                  <td style={{ ...tableCellStyle, color: "rgba(240,238,255,0.65)" }}>{q.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

export default function IgStrategyPage() {
  return <IgStrategyContent />;
}
