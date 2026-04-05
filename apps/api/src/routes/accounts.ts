import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts, posts, postMetrics } from "../db/schema.js";
import { createAccountSchema, updateAccountSchema, paginationSchema } from "../lib/validators.js";
import { notFound } from "../lib/errors.js";

export const accountsRouter = new Hono();

// POST /api/accounts — アカウント作成
accountsRouter.post("/", zValidator("json", createAccountSchema), async (c) => {
  const data = c.req.valid("json");
  const [account] = await db.insert(accounts).values(data).returning();
  return c.json(account, 201);
});

// GET /api/accounts — アカウント一覧
accountsRouter.get("/", zValidator("query", paginationSchema), async (c) => {
  const { limit, offset } = c.req.valid("query");
  const results = await db.query.accounts.findMany({
    limit,
    offset,
    orderBy: (accounts, { desc }) => [desc(accounts.createdAt)],
  });
  // credentials を除外して返す
  const sanitized = results.map(({ credentials, ...rest }) => rest);
  return c.json(sanitized);
});

// GET /api/accounts/:id — アカウント詳細
accountsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
    with: { accountMetrics: true },
  });
  if (!account) throw notFound("Account not found");
  const { credentials, ...rest } = account;
  return c.json(rest);
});

// PUT /api/accounts/:id — アカウント更新
accountsRouter.put("/:id", zValidator("json", updateAccountSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");
  const [updated] = await db
    .update(accounts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();
  if (!updated) throw notFound("Account not found");
  const { credentials, ...rest } = updated;
  return c.json(rest);
});

// DELETE /api/accounts/:id — アカウント削除
accountsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [deleted] = await db.delete(accounts).where(eq(accounts.id, id)).returning();
  if (!deleted) throw notFound("Account not found");
  return c.json({ success: true });
});

// GET /api/accounts/:id/metrics — アカウント別パフォーマンス集計
accountsRouter.get("/:id/metrics", async (c) => {
  const accountId = c.req.param("id");

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });
  if (!account) throw notFound("Account not found");
  const { credentials, ...accountSafe } = account;

  // 投稿集計: ステータス別件数
  const postStats = await db.execute(sql`
    SELECT
      status,
      COUNT(*) AS count
    FROM posts
    WHERE account_id = ${accountId}
    GROUP BY status
  `);

  // メトリクス集計: 直近30日
  const metricStats = await db.execute(sql`
    SELECT
      COALESCE(SUM(pm.likes), 0)          AS total_likes,
      COALESCE(SUM(pm.reposts), 0)        AS total_reposts,
      COALESCE(SUM(pm.replies), 0)        AS total_replies,
      COALESCE(SUM(pm.views), 0)          AS total_views,
      COALESCE(AVG(pm.likes), 0)          AS avg_likes,
      COALESCE(AVG(pm.views), 0)          AS avg_views,
      COUNT(DISTINCT p.id)                AS posts_with_metrics
    FROM post_metrics pm
    JOIN posts p ON p.id = pm.post_id
    WHERE p.account_id = ${accountId}
      AND pm.collected_at >= NOW() - INTERVAL '30 days'
  `);

  // 直近10件の投稿
  const recentPosts = await db.query.posts.findMany({
    where: eq(posts.accountId, accountId),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
    limit: 10,
    with: { postMetrics: { limit: 1, orderBy: (m, { desc }) => [desc(m.collectedAt)] } },
  });

  return c.json({
    account: accountSafe,
    postStats: postStats as unknown as { status: string; count: string }[],
    metrics: metricStats[0] ?? {},
    recentPosts,
  });
});
