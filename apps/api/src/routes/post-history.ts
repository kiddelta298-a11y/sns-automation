import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, gte, desc, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { postHistory } from "../db/schema.js";
import { notFound } from "../lib/errors.js";

const postHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "running", "completed", "failed"]).optional(),
  platform: z.string().optional(),
});

export const postHistoryRouter = new Hono();

// GET /api/post-history
postHistoryRouter.get("/post-history", zValidator("query", postHistoryQuerySchema), async (c) => {
  const { page, limit, status, platform } = c.req.valid("query");

  const conditions = [];
  if (status) conditions.push(eq(postHistory.status, status));
  if (platform) conditions.push(eq(postHistory.platform, platform));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(postHistory)
    .where(where);

  const data = await db
    .select()
    .from(postHistory)
    .where(where)
    .orderBy(desc(postHistory.scheduledAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return c.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// GET /api/post-history/:id
postHistoryRouter.get("/post-history/:id", async (c) => {
  const id = c.req.param("id");

  const [result] = await db
    .select()
    .from(postHistory)
    .where(eq(postHistory.id, id))
    .limit(1);

  if (!result) throw notFound("PostHistory not found");
  return c.json(result);
});

// GET /api/scheduled-posts/status
postHistoryRouter.get("/scheduled-posts/status", async (c) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const running = await db
    .select()
    .from(postHistory)
    .where(eq(postHistory.status, "running"));

  const [{ completed }] = await db
    .select({ completed: sql<number>`count(*)::int` })
    .from(postHistory)
    .where(and(eq(postHistory.status, "completed"), gte(postHistory.createdAt, since24h)));

  const [{ failed }] = await db
    .select({ failed: sql<number>`count(*)::int` })
    .from(postHistory)
    .where(and(eq(postHistory.status, "failed"), gte(postHistory.createdAt, since24h)));

  const last24h = await db
    .select()
    .from(postHistory)
    .where(
      and(
        inArray(postHistory.status, ["completed", "failed"]),
        gte(postHistory.createdAt, since24h),
      ),
    )
    .orderBy(desc(postHistory.createdAt))
    .limit(100);

  return c.json({
    running,
    recent: {
      completed,
      failed,
      last_24h: last24h,
    },
  });
});
