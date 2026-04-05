import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { keywordSets, collectionJobs, trendPosts, winningPatterns } from "../db/schema.js";
import { collectTrendsQueue } from "../lib/queues.js";
import { notFound } from "../lib/errors.js";

export const keywordSetsRouter = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  keywords: z.array(z.string().min(1)).min(1).max(50),
  minKeywordMatch: z.number().int().min(1).default(1),
  description: z.string().optional(),
});

const updateSchema = createSchema.partial();

// ============================================================
// GET /api/keyword-sets — 一覧
// ============================================================
keywordSetsRouter.get("/", async (c) => {
  const rows = await db.query.keywordSets.findMany({
    orderBy: [desc(keywordSets.createdAt)],
  });
  return c.json(rows);
});

// ============================================================
// GET /api/keyword-sets/:id — 詳細
// ============================================================
keywordSetsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const ks = await db.query.keywordSets.findFirst({
    where: eq(keywordSets.id, id),
  });
  if (!ks) throw notFound("KeywordSet not found");

  const jobs = await db.query.collectionJobs.findMany({
    where: eq(collectionJobs.keywordSetId, id),
    orderBy: [desc(collectionJobs.createdAt)],
    limit: 10,
    with: { keywordSet: true },
  });

  return c.json({ ...ks, jobs });
});

// ============================================================
// POST /api/keyword-sets — 作成
// ============================================================
keywordSetsRouter.post("/", zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const [ks] = await db.insert(keywordSets).values(data).returning();
  return c.json(ks, 201);
});

// ============================================================
// PUT /api/keyword-sets/:id — 更新
// ============================================================
keywordSetsRouter.put("/:id", zValidator("json", updateSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");
  const [updated] = await db
    .update(keywordSets)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(keywordSets.id, id))
    .returning();
  if (!updated) throw notFound("KeywordSet not found");
  return c.json(updated);
});

// ============================================================
// DELETE /api/keyword-sets/:id — 削除
// ============================================================
keywordSetsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [deleted] = await db.delete(keywordSets).where(eq(keywordSets.id, id)).returning();
  if (!deleted) throw notFound("KeywordSet not found");
  return c.json({ success: true });
});

// ============================================================
// POST /api/keyword-sets/:id/collect — 収集ジョブを開始
// ============================================================
keywordSetsRouter.post(
  "/:id/collect",
  zValidator("json", z.object({
    targetCount: z.number().int().min(50).max(2000).default(200),
    periodDays: z.number().int().min(0).max(365).default(7),
  })),
  async (c) => {
    const id = c.req.param("id");
    const { targetCount, periodDays } = c.req.valid("json");

    const ks = await db.query.keywordSets.findFirst({
      where: eq(keywordSets.id, id),
    });
    if (!ks) throw notFound("KeywordSet not found");

    // 既に実行中なら弾く
    const running = await db.query.collectionJobs.findFirst({
      where: and(
        eq(collectionJobs.keywordSetId, id),
        eq(collectionJobs.status, "running"),
      ),
    });
    if (running) {
      return c.json({ error: "既に収集中です", jobId: running.id }, 409);
    }

    const [job] = await db
      .insert(collectionJobs)
      .values({ keywordSetId: id, targetCount, status: "pending" })
      .returning();

    await collectTrendsQueue.add("collect-keyword-set", {
      jobId: job.id,
      industryId: null,
      keywordSetId: id,
      industrySlug: `keyword-set-${id}`,
      keywords: ks.keywords as string[],
      minKeywordMatch: ks.minKeywordMatch,
      targetCount,
      platforms: ["threads"],
      periodDays,
    });

    return c.json({ jobId: job.id, status: "pending" }, 202);
  },
);

// ============================================================
// GET /api/keyword-sets/:id/jobs — 収集ジョブ履歴
// ============================================================
keywordSetsRouter.get("/:id/jobs", async (c) => {
  const id = c.req.param("id");
  const jobs = await db.query.collectionJobs.findMany({
    where: eq(collectionJobs.keywordSetId, id),
    orderBy: [desc(collectionJobs.createdAt)],
    limit: 20,
  });
  return c.json(jobs);
});

// ============================================================
// GET /api/keyword-sets/jobs/:jobId — ジョブ状態確認
// ============================================================
keywordSetsRouter.get("/jobs/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const job = await db.query.collectionJobs.findFirst({
    where: eq(collectionJobs.id, jobId),
    with: { keywordSet: true },
  });
  if (!job) throw notFound("Job not found");

  const postCount = await db
    .select({ count: trendPosts.id })
    .from(trendPosts)
    .where(eq(trendPosts.jobId, jobId));

  const pattern = await db.query.winningPatterns.findFirst({
    where: eq(winningPatterns.jobId, jobId),
  });

  return c.json({
    ...job,
    collectedCount: postCount.length,
    hasAnalysis: !!pattern,
    patternId: pattern?.id ?? null,
  });
});
