import { Hono } from "hono";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFile, readdir, stat } from "fs/promises";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

export const mentorRouter = new Hono();

// ── x-mastery-mentor スキル読み込み ──────────────────────────────
// 優先順位: (1) globalインストール (~/.agents/skills/x-mastery-mentor)
//          (2) project-local (.claude/skills/x-mentor-skill)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../../../..");
const SKILL_DIR_CANDIDATES = [
  join(homedir(), ".agents", "skills", "x-mastery-mentor"),
  join(homedir(), ".claude", "skills", "x-mastery-mentor"),
  join(PROJECT_ROOT, ".claude", "skills", "x-mentor-skill"),
];

async function resolveSkillDir(): Promise<string> {
  for (const dir of SKILL_DIR_CANDIDATES) {
    try {
      const s = await stat(join(dir, "SKILL.md"));
      if (s.isFile()) return dir;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `x-mastery-mentor skill not found. Tried:\n  - ${SKILL_DIR_CANDIDATES.join("\n  - ")}`,
  );
}

let cachedSkillContext: string | null = null;
let cachedSkillDir: string | null = null;

async function loadSkillContext(): Promise<{ context: string; dir: string }> {
  if (cachedSkillContext && cachedSkillDir) {
    return { context: cachedSkillContext, dir: cachedSkillDir };
  }

  const skillDir = await resolveSkillDir();
  const skillMd = await readFile(join(skillDir, "SKILL.md"), "utf-8");

  const refDir = join(skillDir, "references");
  const refFiles = await readdir(refDir).catch(() => [] as string[]);
  const refContents: string[] = [];
  for (const name of refFiles) {
    if (!name.endsWith(".md")) continue;
    try {
      const body = await readFile(join(refDir, name), "utf-8");
      refContents.push(`# references/${name}\n\n${body}`);
    } catch {
      /* skip unreadable files */
    }
  }

  cachedSkillContext = [
    "あなたは x-mastery-mentor スキルを体現するX/Twitter運用メンターです。",
    "以下の SKILL.md と references を完全に内面化し、常にこの方法論と口調で回答してください。",
    "ユーザーには **必ず日本語で** 答えてください（スキル内の中国語・英語リソースは日本語に翻訳・要約して伝える）。",
    "マークダウン見出し・箇条書き・コードブロックを積極的に使い、読みやすく構造化すること。",
    "",
    "================== SKILL.md ==================",
    skillMd,
    "",
    "================== REFERENCES ==================",
    refContents.join("\n\n---\n\n"),
  ].join("\n");
  cachedSkillDir = skillDir;

  return { context: cachedSkillContext, dir: cachedSkillDir };
}

// ── シナリオ別 system プロンプト追加指示 ───────────────────────────
// SKILL.md のルーティング A〜E に対応。ユーザーが選んだタブに応じて、
// そのシナリオ用の実行ルールだけ「今回はこれに従え」と追加で注入する。
const SCENARIO_DIRECTIVES: Record<string, string> = {
  write: [
    "【今回のモード: シナリオA 推文/Thread 執筆】",
    "ユーザーの入力を元に、SKILL.mdのシナリオA実行ルールに従い:",
    "1. Hook案を必ず3パターン生成（キャラクター別・角度別・フォーマット別など差別化する）",
    "2. 各案に「なぜ効くか」の根拠をNicolas Cole/Dickie Bush等の方法論から1文で添える",
    "3. 最後に writing-workshop.md のチェックリストでセルフ評価スコアを付ける",
  ].join("\n"),
  topic: [
    "【今回のモード: シナリオB 選題/アイデア出し】",
    "SKILL.mdのシナリオBに従い、4Aマトリクス (Actionable / Analytical / Aspirational / Anthropological) で",
    "話題を最低5つ提案してください。各話題に: 想定Hook、想定フォーマット、4Aのどの象限か を必ず付ける。",
  ].join("\n"),
  review: [
    "【今回のモード: シナリオC コンテンツレビュー】",
    "ユーザーが貼り付けた推文/Threadを quality-analytics.md の診断フレームで採点してください。",
    "必須項目: (a) Hook強度 0-10 (b) 読了率予想 (c) 改善点3つ (d) リライト案1つ",
  ].join("\n"),
  growth: [
    "【今回のモード: シナリオD 成長/戦略相談】",
    "まずユーザーの現在フォロワー数を質問して段階を判定し、growth-monetization.md の",
    "段階別アクションプラン (0-1K / 1K-10K / 10K+) から今やるべき上位3アクションを提示してください。",
    "抽象論ではなく、明日から実行できる粒度まで分解すること。",
  ].join("\n"),
  diagnose: [
    "【今回のモード: シナリオE アカウント診断】",
    "ブラウザ自動化は使わず、ユーザーに以下を手動で貼り付けてもらってください:",
    "(1) @username (2) 直近10〜30件の投稿本文 (3) フォロワー数と過去30日の推移",
    "データが揃ったら mental-models-heuristics.md のレンズで診断レポートを出す。",
    "不足があれば何を追加で貼ってほしいか具体的に指示する。",
  ].join("\n"),
};

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
  });
}

type ChatMessage = { role: "user" | "assistant"; content: string };
type Scenario = keyof typeof SCENARIO_DIRECTIVES;

// POST /api/mentor/chat  — メンターとの会話
mentorRouter.post("/chat", async (c) => {
  let body: { messages?: ChatMessage[]; scenario?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json body" }, 400);
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return c.json({ error: "messages is empty" }, 400);
  }
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || !last.content?.trim()) {
    return c.json({ error: "last message must be a non-empty user message" }, 400);
  }

  const scenario: Scenario | null =
    body.scenario && body.scenario in SCENARIO_DIRECTIVES
      ? (body.scenario as Scenario)
      : null;

  let systemContext: string;
  try {
    const loaded = await loadSkillContext();
    systemContext = scenario
      ? `${loaded.context}\n\n================== CURRENT MODE ==================\n${SCENARIO_DIRECTIVES[scenario]}`
      : loaded.context;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `skill load failed: ${msg}` }, 500);
  }

  let model;
  try {
    model = getGemini();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `gemini init failed: ${msg}` }, 500);
  }

  // Gemini の history は user/model で交互。先頭に system 相当を user として流し込む。
  const history = [
    {
      role: "user" as const,
      parts: [{ text: systemContext }],
    },
    {
      role: "model" as const,
      parts: [{ text: "了解しました。指定モードのルールに厳密に従い、日本語で回答します。" }],
    },
    ...messages.slice(0, -1).map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    })),
  ];

  try {
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(last.content);
    const reply = result.response.text();
    return c.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `gemini error: ${msg}` }, 500);
  }
});

// GET /api/mentor/health — スキル読み込み可能か確認
mentorRouter.get("/health", async (c) => {
  try {
    const loaded = await loadSkillContext();
    const ctx = loaded.context;
    return c.json({
      ok: true,
      skill_dir: loaded.dir,
      context_chars: ctx.length,
      gemini_key: !!process.env.GEMINI_API_KEY,
      scenarios: Object.keys(SCENARIO_DIRECTIVES),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: msg }, 500);
  }
});
