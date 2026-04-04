import Anthropic from "@anthropic-ai/sdk";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { trendPosts, winningPatterns, generatedDrafts } from "../db/schema.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================================
// バズスコア上位の投稿を取得してClaudeに分析させる
// ============================================================
export async function runTrendAnalysis(jobId: string, industryId: string) {
  // スコア上位100件を取得
  const topPosts = await db.query.trendPosts.findMany({
    where: eq(trendPosts.jobId, jobId),
    orderBy: [desc(trendPosts.buzzScore)],
    limit: 100,
  });

  if (topPosts.length === 0) throw new Error("No posts found for analysis");

  // Claude に渡す投稿サンプル（上位30件の本文）
  const samples = topPosts.slice(0, 30).map((p, i) => {
    const engRate = (p.engagementRate * 100).toFixed(2);
    return `[${i + 1}] バズスコア:${p.buzzScore.toFixed(3)} エンゲージ率:${engRate}% フォーマット:${p.postFormat ?? "不明"} 文字数:${p.charCount}\n${p.contentText}`;
  }).join("\n\n---\n\n");

  // フォーマット分布の集計
  const formatCounts: Record<string, number> = {};
  const formatBuzz: Record<string, number[]> = {};
  for (const p of topPosts) {
    const fmt = p.postFormat ?? "other";
    formatCounts[fmt] = (formatCounts[fmt] ?? 0) + 1;
    formatBuzz[fmt] = [...(formatBuzz[fmt] ?? []), p.buzzScore];
  }
  const formatStats = Object.entries(formatCounts).map(([fmt, count]) => {
    const scores = formatBuzz[fmt] ?? [];
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { format: fmt, count, avgBuzz: avg.toFixed(3) };
  }).sort((a, b) => parseFloat(b.avgBuzz) - parseFloat(a.avgBuzz));

  // 文字数帯の集計
  const charBands = { "~50": 0, "51~100": 0, "101~200": 0, "201~": 0 };
  for (const p of topPosts) {
    if (p.charCount <= 50) charBands["~50"]++;
    else if (p.charCount <= 100) charBands["51~100"]++;
    else if (p.charCount <= 200) charBands["101~200"]++;
    else charBands["201~"]++;
  }

  const prompt = `
あなたはSNSのバズ投稿を分析するエキスパートです。
Threadsのバズ投稿${topPosts.length}件を分析し、勝ちパターンをJSON形式で返してください。

## バズ投稿サンプル（上位30件）

${samples}

## フォーマット分布
${formatStats.map(s => `- ${s.format}: ${s.count}件 平均バズスコア:${s.avgBuzz}`).join("\n")}

## 文字数帯分布
${Object.entries(charBands).map(([band, count]) => `- ${band}文字: ${count}件`).join("\n")}

## 出力形式

以下のJSONスキーマで出力してください：

\`\`\`json
{
  "summary": "勝ちパターンの要約（3〜5文）",
  "keyInsights": ["インサイト1", "インサイト2", "インサイト3"],
  "winningFormats": [
    { "format": "フォーマット名", "reason": "なぜ効くか", "example": "冒頭の書き出しパターン例" }
  ],
  "hookPatterns": ["フック（冒頭）パターン例1", "パターン例2", "パターン例3"],
  "optimalLength": { "min": 数値, "max": 数値, "reason": "理由" },
  "contentThemes": ["テーマ1", "テーマ2", "テーマ3"],
  "avoidPatterns": ["避けるべきパターン1", "パターン2"],
  "postingAdvice": "投稿戦略アドバイス（2〜3文）"
}
\`\`\`

JSONのみ出力してください。
`.trim();

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) ?? rawText.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");

  const analysisReport = JSON.parse(jsonMatch[1]);

  // 最適文字数帯
  const maxCharBand = Object.entries(charBands).sort((a, b) => b[1] - a[1])[0][0];
  const optimalCharRange = maxCharBand === "~50" ? { min: 0, max: 50 }
    : maxCharBand === "51~100" ? { min: 51, max: 100 }
    : maxCharBand === "101~200" ? { min: 101, max: 200 }
    : { min: 201, max: 500 };

  const [pattern] = await db.insert(winningPatterns).values({
    jobId,
    industryId,
    analysisReport,
    summary: analysisReport.summary ?? "",
    formatDistribution: Object.fromEntries(formatStats.map(s => [s.format, parseInt(s.avgBuzz)])),
    optimalCharRange,
    topPostSamples: topPosts.slice(0, 5).map(p => p.contentText),
    sampleCount: topPosts.length,
  }).returning();

  return pattern;
}

// ============================================================
// 勝ちパターンを元に投稿文案をN件生成
// ============================================================
export async function runDraftGeneration(
  patternId: string,
  jobId: string,
  seed: string | null,
  count: number,
) {
  const pattern = await db.query.winningPatterns.findFirst({
    where: eq(winningPatterns.id, patternId),
    with: { job: { with: { industry: true } } },
  });
  if (!pattern) throw new Error("Pattern not found");

  const report = pattern.analysisReport as {
    summary?: string;
    keyInsights?: string[];
    winningFormats?: { format: string; reason: string; example: string }[];
    hookPatterns?: string[];
    optimalLength?: { min: number; max: number; reason: string };
    contentThemes?: string[];
    avoidPatterns?: string[];
    postingAdvice?: string;
  };

  const industryName = (pattern.job as { industry?: { name?: string } })?.industry?.name ?? "不明";

  const prompt = `
あなたはThreadsのバズ投稿を作成するプロのコピーライターです。
以下の分析結果を踏まえて、${count}件の投稿文案を作成してください。

## 対象業界
${industryName}

## バズ投稿の勝ちパターン分析
${report.summary ?? ""}

### 重要インサイト
${(report.keyInsights ?? []).map(i => `- ${i}`).join("\n")}

### 勝ちフォーマット
${(report.winningFormats ?? []).map(f => `- ${f.format}: ${f.reason}（例: ${f.example}）`).join("\n")}

### 効果的なフック（冒頭）パターン
${(report.hookPatterns ?? []).map(h => `- ${h}`).join("\n")}

### 最適文字数: ${report.optimalLength?.min ?? 50}〜${report.optimalLength?.max ?? 150}文字

### 避けるべきパターン
${(report.avoidPatterns ?? []).map(a => `- ${a}`).join("\n")}

${seed ? `## 投稿の種（伝えたいこと）\n${seed}` : ""}

## 出力形式

${count}件の投稿文案を以下のJSON形式で出力してください：

\`\`\`json
[
  {
    "contentText": "投稿本文（改行含む）",
    "postFormat": "question|list|story|opinion|punchline",
    "rationale": "このパターンを採用した理由（1〜2文）"
  }
]
\`\`\`

- 投稿は実際にThreadsに投稿できる完成品にする
- フォーマットをバランスよく使う（同じフォーマットを重複させない）
- バズパターンの特徴を忠実に再現する
- JSONのみ出力する
`.trim();

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) ?? rawText.match(/(\[[\s\S]*\])/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");

  const generated: { contentText: string; postFormat: string; rationale: string }[] = JSON.parse(jsonMatch[1]);

  const inserted = await Promise.all(
    generated.map(g =>
      db.insert(generatedDrafts).values({
        jobId,
        patternId,
        contentText: g.contentText,
        postFormat: g.postFormat,
        rationale: g.rationale,
        status: "draft",
      }).returning().then(rows => rows[0]),
    ),
  );

  return inserted;
}
