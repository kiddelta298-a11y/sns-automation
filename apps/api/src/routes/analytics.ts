import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { clickEvents, redirectLinks, posts } from "../db/schema.js";
import { clickAnalyticsQuerySchema } from "../lib/validators.js";

export const analyticsRouter = new Hono();

// GET /api/analytics/clicks — クリック集計
analyticsRouter.get("/clicks", zValidator("query", clickAnalyticsQuerySchema), async (c) => {
  const { redirectLinkId, postId, from, to } = c.req.valid("query");

  const conditions = [];
  if (redirectLinkId) {
    conditions.push(eq(clickEvents.redirectLinkId, redirectLinkId));
  }
  if (from) {
    conditions.push(gte(clickEvents.clickedAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(clickEvents.clickedAt, new Date(to)));
  }

  // postId でフィルタする場合は redirect_links を経由
  if (postId) {
    const linkIds = await db
      .select({ id: redirectLinks.id })
      .from(redirectLinks)
      .where(eq(redirectLinks.postId, postId));
    if (linkIds.length === 0) {
      return c.json({ totalClicks: 0, clicksByDay: [] });
    }
    conditions.push(
      sql`${clickEvents.redirectLinkId} IN (${sql.join(
        linkIds.map((l) => sql`${l.id}`),
        sql`,`,
      )})`,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // 総クリック数
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clickEvents)
    .where(whereClause);

  // 日別クリック数
  const clicksByDay = await db
    .select({
      date: sql<string>`date_trunc('day', ${clickEvents.clickedAt})::date::text`,
      clicks: sql<number>`count(*)::int`,
    })
    .from(clickEvents)
    .where(whereClause)
    .groupBy(sql`date_trunc('day', ${clickEvents.clickedAt})`)
    .orderBy(sql`date_trunc('day', ${clickEvents.clickedAt})`);

  return c.json({ totalClicks: count, clicksByDay });
});

// GET /api/analytics/posts/:id — 投稿別パフォーマンス
analyticsRouter.get("/posts/:id", async (c) => {
  const postId = c.req.param("id");

  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
    with: {
      postMetrics: {
        orderBy: (pm, { desc }) => [desc(pm.collectedAt)],
        limit: 1,
      },
      redirectLinks: true,
      campaign: true,
      appealPattern: true,
    },
  });

  if (!post) return c.json({ error: "Post not found" }, 404);

  // 各リダイレクトリンクのクリック数合計
  let totalClicks = 0;
  for (const link of post.redirectLinks) {
    totalClicks += link.clickCount;
  }

  return c.json({
    post,
    totalClicks,
    latestMetrics: post.postMetrics[0] || null,
  });
});
