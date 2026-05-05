"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Send, Loader2, User, Bot,
  Pencil, Lightbulb, ClipboardCheck, Rocket, Stethoscope,
  RotateCcw, Brain,
} from "lucide-react";
import { postMentorChat, type MentorMessage, type MentorScenario } from "@/lib/api";
import { XAlgorithmContent } from "@/components/x/x-algorithm-content";

// ─── シナリオ定義 ─────────────────────────────────────────────
interface ScenarioTab {
  key: MentorScenario;
  label: string;
  short: string;
  icon: typeof Pencil;
  hint: string;
  placeholder: string;
  quickPrompts: string[];
}

const SCENARIOS: ScenarioTab[] = [
  {
    key: "write",
    label: "執筆",
    short: "A",
    icon: Pencil,
    hint: "推文・Threadを3パターンのHook付きで生成。writing-workshop.md のチェックリストで自動採点。",
    placeholder: "例: AIエージェント開発で学んだ3つの失敗を推文にしたい",
    quickPrompts: [
      "「AIエージェント開発で学んだ3つの失敗」を推文3パターンで",
      "Claude Code の Skill 機能についてThreadで解説したい",
      "「30歳未満の起業家に知ってほしい5つのこと」を list 形式で",
    ],
  },
  {
    key: "topic",
    label: "選題",
    short: "B",
    icon: Lightbulb,
    hint: "4Aマトリクス (Actionable/Analytical/Aspirational/Anthropological) で話題を5本以上出し分け。",
    placeholder: "例: AI・開発者向けのアカウントで1週間分の話題を出して",
    quickPrompts: [
      "AI/Tech開発者向けで1週間分の話題を5本",
      "個人開発SaaSのアカウントで今週バズりそうな切り口",
      "「学習系コンテンツ」でactionable寄りに5本",
    ],
  },
  {
    key: "review",
    label: "レビュー",
    short: "C",
    icon: ClipboardCheck,
    hint: "貼った推文/Threadを Hook強度・読了率予想・改善点3つ・リライト案1つで診断。",
    placeholder: "レビューしてほしい推文やThreadをここに貼り付けてください",
    quickPrompts: [
      "この推文を診断してください: 「今日AIで〜」（全文を貼る）",
      "私のThreadの構成をチェックして弱い箇所を指摘",
      "Hookだけ複数パターンでリライトして",
    ],
  },
  {
    key: "growth",
    label: "成長戦略",
    short: "D",
    icon: Rocket,
    hint: "フォロワー段階 (0-1K / 1K-10K / 10K+) に応じた成長アクションTop3を具体化。",
    placeholder: "例: フォロワー450人。次の1ヶ月で何をやるべき？",
    quickPrompts: [
      "フォロワー450人。次の30日で最優先アクションTop3",
      "1,200フォロワーで停滞中。伸び悩みを打破したい",
      "10K超えたら次はマネタイズ？ブランド構築？",
    ],
  },
  {
    key: "diagnose",
    label: "診断",
    short: "E",
    icon: Stethoscope,
    hint: "アカウント名と投稿サンプルを貼ると、mental-models-heuristics.md で総合診断。",
    placeholder: "例: @username と 直近10件の投稿、フォロワー数を貼ってください",
    quickPrompts: [
      "@username と 直近10件の投稿、フォロワー数です（貼る）",
      "診断のために何を提供すればいい？",
      "競合アカウント @xxx と比較してほしい",
    ],
  },
];

// ─── メッセージストア: タブごとに独立した会話を保持 ─────────────────
type HistoryMap = Record<MentorScenario, MentorMessage[]>;
const EMPTY_HISTORY: HistoryMap = {
  write: [], topic: [], review: [], growth: [], diagnose: [],
};

function MentorContent() {
  const [activeKey, setActiveKey] = useState<MentorScenario>("write");
  const [histories, setHistories] = useState<HistoryMap>(EMPTY_HISTORY);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => SCENARIOS.find((s) => s.key === activeKey)!, [activeKey]);
  const messages = histories[activeKey];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const next: MentorMessage[] = [...messages, { role: "user", content: trimmed }];
    setHistories((h) => ({ ...h, [activeKey]: next }));
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const { reply } = await postMentorChat(next, activeKey);
      setHistories((h) => ({ ...h, [activeKey]: [...next, { role: "assistant", content: reply }] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function resetActive() {
    setHistories((h) => ({ ...h, [activeKey]: [] }));
    setError(null);
  }

  return (
    <div className="flex h-[calc(100vh-0rem)] flex-col">
      {/* ── ヘッダー ── */}
      <div className="flex items-center gap-3 px-6 py-5 border-b"
        style={{ borderColor: "rgba(139,92,246,0.12)" }}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #a855f7)",
            boxShadow: "0 0 20px rgba(139,92,246,0.45)",
          }}>
          <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold"
            style={{
              background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
            X-Mentor（x-mastery-mentor）
          </h1>
          <p className="text-xs" style={{ color: "rgba(240,238,255,0.4)" }}>
            Nicolas Cole / Dickie Bush / Sahil Bloom / Justin Welsh / Dan Koe / Alex Hormozi の方法論 + X アルゴリズム分析
          </p>
        </div>
        <button
          onClick={resetActive}
          disabled={messages.length === 0}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all disabled:opacity-30"
          style={{
            background: "rgba(139,92,246,0.08)",
            border: "1px solid rgba(139,92,246,0.2)",
            color: "rgba(240,238,255,0.7)",
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          このタブをリセット
        </button>
      </div>

      {/* ── シナリオサブタブ ── */}
      <div className="flex gap-1 overflow-x-auto border-b px-4 py-2"
        style={{ borderColor: "rgba(139,92,246,0.1)" }}>
        {SCENARIOS.map((s) => {
          const isActive = s.key === activeKey;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              onClick={() => { setActiveKey(s.key); setError(null); }}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all whitespace-nowrap"
              style={isActive ? {
                background: "linear-gradient(135deg, rgba(124,58,237,0.32) 0%, rgba(168,85,247,0.16) 100%)",
                color: "#e9d5ff",
                border: "1px solid rgba(167,139,250,0.5)",
              } : {
                background: "transparent",
                color: "rgba(240,238,255,0.5)",
                border: "1px solid transparent",
              }}
            >
              <Icon className="h-4 w-4" />
              <span>{s.label}</span>
              <span className="text-[10px] opacity-60">({s.short})</span>
              {histories[s.key].length > 0 && (
                <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]"
                  style={{ background: "rgba(167,139,250,0.3)", color: "#e9d5ff" }}>
                  {histories[s.key].filter((m) => m.role === "user").length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── モードヒント ── */}
      <div className="border-b px-6 py-2.5 text-xs"
        style={{
          borderColor: "rgba(139,92,246,0.08)",
          background: "rgba(139,92,246,0.04)",
          color: "rgba(240,238,255,0.6)",
        }}>
        <span className="font-semibold" style={{ color: "#c4b5fd" }}>{active.label}モード：</span>{" "}
        {active.hint}
      </div>

      {/* ── メッセージ領域 ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && !loading && (
          <div className="mx-auto max-w-2xl">
            <p className="mb-3 text-xs font-semibold" style={{ color: "rgba(240,238,255,0.5)" }}>
              クイックスタート
            </p>
            <div className="grid gap-2">
              {active.quickPrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-xl px-4 py-3 text-left text-sm transition-all"
                  style={{
                    background: "rgba(139,92,246,0.06)",
                    border: "1px solid rgba(139,92,246,0.15)",
                    color: "rgba(240,238,255,0.75)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.14)";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.35)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.06)";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.15)";
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-3xl space-y-5">
          {messages.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} />
          ))}
          {loading && (
            <div className="flex items-center gap-3 px-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}>
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="flex items-center gap-2 text-sm" style={{ color: "rgba(240,238,255,0.55)" }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                考え中…
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-xl px-4 py-3 text-sm"
              style={{
                background: "rgba(244,63,94,0.1)",
                border: "1px solid rgba(244,63,94,0.3)",
                color: "#fb7185",
              }}>
              エラー: {error}
            </div>
          )}
        </div>
      </div>

      {/* ── 入力欄 ── */}
      <div className="border-t px-6 py-4"
        style={{ borderColor: "rgba(139,92,246,0.12)", background: "rgba(10,8,20,0.6)" }}>
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={active.placeholder + "（Cmd/Ctrl+Enter で送信）"}
            rows={3}
            className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none"
            style={{
              background: "rgba(139,92,246,0.05)",
              border: "1px solid rgba(139,92,246,0.2)",
              color: "rgba(240,238,255,0.9)",
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="flex h-12 w-12 items-center justify-center rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              boxShadow: "0 0 16px rgba(139,92,246,0.4)",
            }}
          >
            {loading ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Send className="h-5 w-5 text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: isUser
            ? "rgba(139,92,246,0.2)"
            : "linear-gradient(135deg, #7c3aed, #a855f7)",
          border: isUser ? "1px solid rgba(139,92,246,0.35)" : "none",
        }}>
        {isUser
          ? <User className="h-4 w-4" style={{ color: "#c4b5fd" }} />
          : <Bot className="h-4 w-4 text-white" />}
      </div>
      <div className="flex-1 rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed"
        style={{
          background: isUser ? "rgba(139,92,246,0.08)" : "rgba(30,20,55,0.6)",
          border: isUser ? "1px solid rgba(139,92,246,0.2)" : "1px solid rgba(139,92,246,0.12)",
          color: "rgba(240,238,255,0.88)",
        }}>
        {content}
      </div>
    </div>
  );
}

// ─── トップタブ付きラッパー: Mentor / Algorithm 切替 ───────────────
type XToolKey = "mentor" | "algorithm";

export default function XToolsPage() {
  const [tool, setTool] = useState<XToolKey>("mentor");
  return (
    <div className="flex h-[calc(100vh-0rem)] flex-col">
      {/* ── トップタブ ── */}
      <div className="flex gap-1 border-b px-6 py-3"
        style={{ borderColor: "rgba(139,92,246,0.12)", background: "rgba(13,10,25,0.6)" }}>
        <button
          onClick={() => setTool("mentor")}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all"
          style={tool === "mentor" ? {
            background: "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(168,85,247,0.4))",
            border: "1px solid rgba(139,92,246,0.5)",
            color: "#e9d5ff",
          } : {
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(139,92,246,0.15)",
            color: "rgba(240,238,255,0.5)",
          }}
        >
          <Sparkles className="h-4 w-4" />
          X-Mentor
        </button>
        <button
          onClick={() => setTool("algorithm")}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all"
          style={tool === "algorithm" ? {
            background: "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(168,85,247,0.4))",
            border: "1px solid rgba(139,92,246,0.5)",
            color: "#e9d5ff",
          } : {
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(139,92,246,0.15)",
            color: "rgba(240,238,255,0.5)",
          }}
        >
          <Brain className="h-4 w-4" />
          Xアルゴリズム
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tool === "mentor" ? <MentorContent /> : <div className="p-6"><XAlgorithmContent /></div>}
      </div>
    </div>
  );
}
