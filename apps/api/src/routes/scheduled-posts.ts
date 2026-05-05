import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { scheduledPosts, posts, accounts } from "../db/schema.js";
import { notFound } from "../lib/errors.js";

const selectedCols = {
  id: scheduledPosts.id,
  postId: scheduledPosts.postId,
  scheduledAt: scheduledPosts.scheduledAt,
  executedAt: scheduledPosts.executedAt,
  startedAt: scheduledPosts.startedAt,
  status: scheduledPosts.status,
  retryCount: scheduledPosts.retryCount,
  errorMessage: scheduledPosts.errorMessage,
  progressPct: scheduledPosts.progressPct,
  currentStage: scheduledPosts.currentStage,
  screenshotPath: scheduledPosts.screenshotPath,
  platform: posts.platform,
  contentText: posts.contentText,
  linkUrl: posts.linkUrl,
  accountId: posts.accountId,
  username: accounts.username,
  displayName: accounts.displayName,
};

async function fetchLive() {
  return db
    .select(selectedCols)
    .from(scheduledPosts)
    .innerJoin(posts, eq(scheduledPosts.postId, posts.id))
    .innerJoin(accounts, eq(posts.accountId, accounts.id))
    .where(eq(scheduledPosts.status, "processing"));
}

export const scheduledPostsRouter = new Hono();

// GET /api/scheduled-posts/live — status='processing' の一覧
scheduledPostsRouter.get("/live", async (c) => {
  const rows = await fetchLive();
  return c.json(rows);
});

// GET /api/scheduled-posts/stream — SSE: 5秒毎に live データを push
scheduledPostsRouter.get("/stream", async (c) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Cache-Control", "no-cache");

  return streamSSE(c, async (stream) => {
    // 最大30分（360回 × 5秒）維持
    for (let tick = 0; tick < 360; tick++) {
      if (stream.aborted) break;

      try {
        const rows = await fetchLive();
        await stream.writeSSE({
          data: JSON.stringify(rows),
          event: "update",
        });
      } catch {
        break;
      }

      await stream.sleep(5000);
    }
  });
});

// GET /api/scheduled-posts/:id — 個別詳細
scheduledPostsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");

  const [result] = await db
    .select(selectedCols)
    .from(scheduledPosts)
    .innerJoin(posts, eq(scheduledPosts.postId, posts.id))
    .innerJoin(accounts, eq(posts.accountId, accounts.id))
    .where(eq(scheduledPosts.id, id))
    .limit(1);

  if (!result) throw notFound("ScheduledPost not found");
  return c.json(result);
});
