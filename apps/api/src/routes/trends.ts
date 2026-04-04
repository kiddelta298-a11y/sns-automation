import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  collectionJobs,
  trendPosts,
  winningPatterns,
  generatedDrafts,
  industries,
  scheduledPosts,
  posts,
  accounts,
} from "../db/schema.js";
import {
  startCollectionSchema,
  trendRankingQuerySchema,
  analyzeJobSchema,
  generateDraftsSchema,
  postDraftSchema,
} from "../lib/validators.js";
import { collectTrendsQueue, generateDraftsQueue } from "../lib/queues.js";

export const trendsRouter = new Hono();

// ============================================================
// POST /api/trends/collect — 収集ジョブ開始
// ============================================================
trendsRouter.post("/collect", zValidator("json", startCollectionSchema), async (c) => {
  const { industryId, targetCount } = c.req.valid("json");

  const industry = await db.query.industries.findFirst({
    where: eq(industries.id, industryId),
  });
  if (!industry) return c.json({ error: "Industry not found" }, 404);

  // 既に実行中のジョブがあればブロック
  const running = await db.query.collectionJobs.findFirst({
    where: and(
      eq(collectionJobs.industryId, industryId),
      eq(collectionJobs.status, "running"),
    ),
  });
  if (running) {
    return c.json({ error: "Collection already running for this industry", jobId: running.id }, 409);
  }

  const [job] = await db.insert(collectionJobs).values({
    industryId,
    targetCount,
    status: "pending",
  }).returning();

  // BullMQ にジョブを投入
  await collectTrendsQueue.add("collect", {
    jobId: job.id,
    industryId,
    industrySlug: industry.slug,
    keywords: industry.keywords as string[],
    targetCount,
  });

  return c.json({ jobId: job.id, status: "pending" }, 202);
});

// ============================================================
// GET /api/trends/jobs/:id — ジョブ状態確認
// ============================================================
trendsRouter.get("/jobs/:id", async (c) => {
  const id = c.req.param("id");
  const job = await db.query.collectionJobs.findFirst({
    where: eq(collectionJobs.id, id),
    with: { industry: true },
  });
  if (!job) return c.json({ error: "Job not found" }, 404);

  const postCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trendPosts)
    .where(eq(trendPosts.jobId, id));

  const pattern = await db.query.winningPatterns.findFirst({
    where: eq(winningPatterns.jobId, id),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  return c.json({
    ...job,
    collectedCount: postCount[0].count,
    hasAnalysis: !!pattern,
    patternId: pattern?.id ?? null,
  });
});

// ============================================================
// GET /api/trends/jobs — ジョブ一覧
// ============================================================
trendsRouter.get("/jobs", async (c) => {
  const industryId = c.req.query("industryId");
  const jobs = await db.query.collectionJobs.findMany({
    where: industryId ? eq(collectionJobs.industryId, industryId) : undefined,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 20,
    with: { industry: true },
  });
  return c.json(jobs);
});

// ============================================================
// GET /api/trends/ranking — バズランキング
// ============================================================
trendsRouter.get("/ranking", zValidator("query", trendRankingQuerySchema), async (c) => {
  const { industryId, jobId, metric, format, limit } = c.req.valid("query");

  const conditions = [eq(trendPosts.industryId, industryId)];
  if (jobId) conditions.push(eq(trendPosts.jobId, jobId));
  if (format !== "all") conditions.push(eq(trendPosts.postFormat, format));

  // hidden_gem = フォロワーが少ない（<5000）のにバズスコアが高い
  const orderBy =
    metric === "hidden_gem"
      ? desc(trendPosts.buzzScore)
      : desc(
          metric === "buzz_score"      ? trendPosts.buzzScore :
          metric === "engagement_rate" ? trendPosts.engagementRate :
          metric === "like_count"      ? trendPosts.likeCount :
          metric === "repost_count"    ? trendPosts.repostCount :
                                         trendPosts.viewCount,
        );

  const hiddenGemCondition =
    metric === "hidden_gem"
      ? sql`${trendPosts.authorFollowers} < 5000 OR ${trendPosts.authorFollowers} IS NULL`
      : undefined;

  if (hiddenGemCondition) conditions.push(hiddenGemCondition);

  const results = await db.query.trendPosts.findMany({
    where: and(...conditions),
    orderBy: [orderBy],
    limit,
  });

  // フォーマット分布集計
  const distribution = await db
    .select({
      format: trendPosts.postFormat,
      count: sql<number>`count(*)::int`,
      avgBuzz: sql<number>`round(avg(${trendPosts.buzzScore})::numeric, 3)`,
    })
    .from(trendPosts)
    .where(and(
      eq(trendPosts.industryId, industryId),
      ...(jobId ? [eq(trendPosts.jobId, jobId)] : []),
    ))
    .groupBy(trendPosts.postFormat);

  return c.json({ posts: results, formatDistribution: distribution });
});

// ============================================================
// POST /api/trends/analyze — Claude分析実行
// ============================================================
trendsRouter.post("/analyze", zValidator("json", analyzeJobSchema), async (c) => {
  const { jobId } = c.req.valid("json");

  const job = await db.query.collectionJobs.findFirst({
    where: eq(collectionJobs.id, jobId),
    with: { industry: true },
  });
  if (!job) return c.json({ error: "Job not found" }, 404);
  if (job.status !== "completed") {
    return c.json({ error: "Job not completed yet", status: job.status }, 400);
  }

  const count = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trendPosts)
    .where(eq(trendPosts.jobId, jobId));

  if (count[0].count < 10) {
    return c.json({ error: "Not enough posts to analyze (minimum 10)" }, 400);
  }

  // analyzeTrendsQueue ではなく API内で直接実行（同期レスポンス）
  // 重い場合はキュー化も可能だが、ここでは直接Claudeを呼ぶ
  const { runTrendAnalysis } = await import("../lib/claude-analysis.js");
  const pattern = await runTrendAnalysis(jobId, job.industryId);

  return c.json({ patternId: pattern.id, summary: pattern.summary });
});

// ============================================================
// GET /api/trends/patterns/:jobId — 分析結果取得
// ============================================================
trendsRouter.get("/patterns/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const pattern = await db.query.winningPatterns.findFirst({
    where: eq(winningPatterns.jobId, jobId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  if (!pattern) return c.json({ error: "No analysis found for this job" }, 404);
  return c.json(pattern);
});

// ============================================================
// POST /api/trends/generate — 投稿文案生成
// ============================================================
trendsRouter.post("/generate", zValidator("json", generateDraftsSchema), async (c) => {
  const { jobId, seed, count } = c.req.valid("json");

  const pattern = await db.query.winningPatterns.findFirst({
    where: eq(winningPatterns.jobId, jobId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  if (!pattern) {
    return c.json({ error: "No analysis found. Run /analyze first." }, 400);
  }

  const { runDraftGeneration } = await import("../lib/claude-analysis.js");
  const drafts = await runDraftGeneration(pattern.id, jobId, seed ?? null, count);

  return c.json({ drafts });
});

// ============================================================
// GET /api/trends/drafts — 生成文案一覧
// ============================================================
trendsRouter.get("/drafts", async (c) => {
  const jobId = c.req.query("jobId");
  const drafts = await db.query.generatedDrafts.findMany({
    where: jobId ? eq(generatedDrafts.jobId, jobId) : undefined,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 50,
  });
  return c.json(drafts);
});

// ============================================================
// POST /api/trends/drafts/:id/post — 文案をThreadsに投稿
// ============================================================
trendsRouter.post("/drafts/:id/post", zValidator("json", postDraftSchema), async (c) => {
  const draftId = c.req.param("id");
  const { accountId, scheduledAt } = c.req.valid("json");

  const draft = await db.query.generatedDrafts.findFirst({
    where: eq(generatedDrafts.id, draftId),
  });
  if (!draft) return c.json({ error: "Draft not found" }, 404);
  if (draft.status === "posted") return c.json({ error: "Already posted" }, 409);

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });
  if (!account) return c.json({ error: "Account not found" }, 404);

  // posts テーブルに登録
  const [post] = await db.insert(posts).values({
    accountId,
    platform: "threads",
    contentText: draft.contentText,
    status: scheduledAt ? "scheduled" : "scheduled",
    metadata: { source: "generated_draft", draftId },
  }).returning();

  // 予約投稿テーブルに登録
  await db.insert(scheduledPosts).values({
    postId: post.id,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
    status: "pending",
  });

  // 文案のステータス更新
  await db.update(generatedDrafts)
    .set({ status: "posted", postId: post.id })
    .where(eq(generatedDrafts.id, draftId));

  return c.json({ postId: post.id, scheduledAt: scheduledAt ?? new Date().toISOString() }, 201);
});

// ============================================================
// PATCH /api/trends/drafts/:id — 文案編集
// ============================================================
trendsRouter.patch("/drafts/:id", async (c) => {
  const draftId = c.req.param("id");
  const body = await c.req.json<{ contentText?: string; status?: string }>();

  const draft = await db.query.generatedDrafts.findFirst({
    where: eq(generatedDrafts.id, draftId),
  });
  if (!draft) return c.json({ error: "Draft not found" }, 404);

  const [updated] = await db.update(generatedDrafts)
    .set({
      ...(body.contentText !== undefined && { contentText: body.contentText }),
      ...(body.status !== undefined && { status: body.status }),
    })
    .where(eq(generatedDrafts.id, draftId))
    .returning();

  return c.json(updated);
});

// ============================================================
// GET /api/trends/metrics/:jobId — 収集結果の集計メトリクス
// ============================================================
trendsRouter.get("/metrics/:jobId", async (c) => {
  const jobId = c.req.param("jobId");

  const job = await db.query.collectionJobs.findFirst({
    where: eq(collectionJobs.id, jobId),
    with: { industry: true },
  });
  if (!job) return c.json({ error: "Job not found" }, 404);

  // 全投稿取得
  const allPosts = await db.query.trendPosts.findMany({
    where: eq(trendPosts.jobId, jobId),
    orderBy: [desc(trendPosts.buzzScore)],
  });
  if (allPosts.length === 0) return c.json({ error: "No posts collected yet" }, 404);

  // Top10
  const top10 = allPosts.slice(0, 10);

  // フォーマット分布
  const fmtMap: Record<string, { count: number; totalBuzz: number; totalEngRate: number }> = {};
  for (const p of allPosts) {
    const fmt = p.postFormat ?? "other";
    if (!fmtMap[fmt]) fmtMap[fmt] = { count: 0, totalBuzz: 0, totalEngRate: 0 };
    fmtMap[fmt].count++;
    fmtMap[fmt].totalBuzz += p.buzzScore;
    fmtMap[fmt].totalEngRate += p.engagementRate;
  }
  const formatStats = Object.entries(fmtMap).map(([format, v]) => ({
    format,
    count: v.count,
    pct: Math.round(v.count / allPosts.length * 100),
    avgBuzzScore: parseFloat((v.totalBuzz / v.count).toFixed(4)),
    avgEngRate: parseFloat((v.totalEngRate / v.count).toFixed(4)),
  })).sort((a, b) => b.avgBuzzScore - a.avgBuzzScore);

  // 文字数帯分布
  const charBands = [
    { label: "〜50字",    min: 0,   max: 50  },
    { label: "51〜100字", min: 51,  max: 100 },
    { label: "101〜150字",min: 101, max: 150 },
    { label: "151〜200字",min: 151, max: 200 },
    { label: "201字〜",   min: 201, max: Infinity },
  ].map(band => {
    const inBand = allPosts.filter(p => p.charCount >= band.min && p.charCount <= band.max);
    const avgBuzz = inBand.length
      ? parseFloat((inBand.reduce((s, p) => s + p.buzzScore, 0) / inBand.length).toFixed(4))
      : 0;
    return { ...band, count: inBand.length, avgBuzzScore: avgBuzz, pct: Math.round(inBand.length / allPosts.length * 100) };
  });

  // 頻出キーワード抽出（形態素なしの簡易版：単語分割）
  const stopWords = new Set(["の","に","は","を","が","で","と","た","て","い","し","る","な","も","れ","から","まで","ので","だ","です","ます","こと","これ","その","あの","ここ","どの","ため","という","として","によって","における"]);
  const wordFreq: Record<string, number> = {};
  for (const p of allPosts) {
    const words = (p.contentText as string)
      .replace(/[！!？?。、…「」【】\n\r\t]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 2 && w.length <= 15 && !stopWords.has(w));
    for (const w of words) {
      wordFreq[w] = (wordFreq[w] ?? 0) + 1;
    }
  }
  const topKeywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word, count]) => ({ word, count, pct: Math.round(count / allPosts.length * 100) }));

  // 投稿時間帯分布
  const hourDist: Record<number, { count: number; totalBuzz: number }> = {};
  for (const p of allPosts) {
    if (!p.postedAt) continue;
    const h = new Date(p.postedAt).getHours();
    if (!hourDist[h]) hourDist[h] = { count: 0, totalBuzz: 0 };
    hourDist[h].count++;
    hourDist[h].totalBuzz += p.buzzScore;
  }
  const hourStats = Object.entries(hourDist).map(([h, v]) => ({
    hour: parseInt(h),
    count: v.count,
    avgBuzz: parseFloat((v.totalBuzz / v.count).toFixed(4)),
  })).sort((a, b) => b.avgBuzz - a.avgBuzz);

  // 全体サマリー統計
  const totalBuzz = allPosts.reduce((s, p) => s + p.buzzScore, 0);
  const totalEngRate = allPosts.reduce((s, p) => s + p.engagementRate, 0);
  const withImage = allPosts.filter(p => p.hasImage).length;

  const summary = {
    totalPosts:     allPosts.length,
    avgBuzzScore:   parseFloat((totalBuzz / allPosts.length).toFixed(4)),
    avgEngRate:     parseFloat((totalEngRate / allPosts.length).toFixed(4)),
    maxBuzzScore:   allPosts[0]?.buzzScore ?? 0,
    avgCharCount:   Math.round(allPosts.reduce((s, p) => s + p.charCount, 0) / allPosts.length),
    imagePostPct:   Math.round(withImage / allPosts.length * 100),
    topFormat:      formatStats[0]?.format ?? "other",
    optimalCharMin: charBands.sort((a, b) => b.avgBuzzScore - a.avgBuzzScore)[0]?.min ?? 0,
    optimalCharMax: charBands.sort((a, b) => b.avgBuzzScore - a.avgBuzzScore)[0]?.max ?? 150,
  };

  return c.json({ job, summary, top10, formatStats, charBands, topKeywords, hourStats });
});
