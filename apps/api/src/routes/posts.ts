import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { posts, scheduledPosts } from "../db/schema.js";
import { createPostSchema, updatePostSchema, paginationSchema } from "../lib/validators.js";
import { notFound } from "../lib/errors.js";

export const postsRouter = new Hono();

// POST /api/posts — 投稿作成
postsRouter.post("/", zValidator("json", createPostSchema), async (c) => {
  const data = c.req.valid("json");
  const [post] = await db
    .insert(posts)
    .values({
      accountId: data.accountId,
      campaignId: data.campaignId,
      appealPatternId: data.appealPatternId,
      platform: data.platform,
      contentText: data.contentText,
      linkUrl: data.linkUrl,
      status: data.status,
      metadata: data.metadata,
    })
    .returning();
  return c.json(post, 201);
});

// GET /api/posts — 投稿一覧
postsRouter.get("/", zValidator("query", paginationSchema), async (c) => {
  const { limit, offset } = c.req.valid("query");
  const results = await db.query.posts.findMany({
    limit,
    offset,
    orderBy: (posts, { desc }) => [desc(posts.createdAt)],
    with: {
      account: true,
      redirectLinks: true,
    },
  });
  return c.json(results);
});

// GET /api/posts/:id — 投稿詳細
postsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, id),
    with: {
      account: true,
      postMedia: true,
      postMetrics: true,
      redirectLinks: true,
      campaign: true,
      appealPattern: true,
    },
  });
  if (!post) throw notFound("Post not found");
  return c.json(post);
});

// PUT /api/posts/:id — 投稿更新
postsRouter.put("/:id", zValidator("json", updatePostSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");
  const { postedAt, ...rest } = data;
  const [updated] = await db
    .update(posts)
    .set({ ...rest, ...(postedAt ? { postedAt: new Date(postedAt) } : {}), updatedAt: new Date() })
    .where(eq(posts.id, id))
    .returning();
  if (!updated) throw notFound("Post not found");
  return c.json(updated);
});

// DELETE /api/posts/:id — 投稿削除
postsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [deleted] = await db.delete(posts).where(eq(posts.id, id)).returning();
  if (!deleted) throw notFound("Post not found");
  return c.json({ message: "Deleted" });
});

// GET /api/posts/calendar?from=ISO&to=ISO — カレンダー用予約投稿一覧
postsRouter.get("/calendar", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");

  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  const rows = await db.query.scheduledPosts.findMany({
    where: and(
      gte(scheduledPosts.scheduledAt, fromDate),
      lte(scheduledPosts.scheduledAt, toDate),
    ),
    with: {
      post: {
        with: { account: true },
      },
    },
    orderBy: (sp, { asc }) => [asc(sp.scheduledAt)],
  });

  return c.json(rows);
});
