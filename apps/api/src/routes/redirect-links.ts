import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { redirectLinks } from "../db/schema.js";
import { createRedirectLinkSchema, paginationSchema } from "../lib/validators.js";
import { notFound } from "../lib/errors.js";

export const redirectLinksRouter = new Hono();

// POST /api/redirect-links — 短縮URL生成
redirectLinksRouter.post("/", zValidator("json", createRedirectLinkSchema), async (c) => {
  const data = c.req.valid("json");
  const shortCode = data.shortCode || nanoid(8);

  const [link] = await db
    .insert(redirectLinks)
    .values({
      postId: data.postId,
      shortCode,
      destinationUrl: data.destinationUrl,
    })
    .returning();

  const baseUrl = process.env.REDIRECT_BASE_URL || "http://localhost:3000";
  return c.json(
    {
      ...link,
      shortUrl: `${baseUrl}/r/${link.shortCode}`,
    },
    201,
  );
});

// GET /api/redirect-links — リダイレクトリンク一覧
redirectLinksRouter.get("/", zValidator("query", paginationSchema), async (c) => {
  const { limit, offset } = c.req.valid("query");
  const results = await db.query.redirectLinks.findMany({
    limit,
    offset,
    orderBy: (redirectLinks, { desc }) => [desc(redirectLinks.createdAt)],
    with: { post: true },
  });
  return c.json(results);
});

// GET /api/redirect-links/:id — リダイレクトリンク詳細
redirectLinksRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const link = await db.query.redirectLinks.findFirst({
    where: eq(redirectLinks.id, id),
    with: { post: true },
  });
  if (!link) throw notFound("Redirect link not found");
  return c.json(link);
});
