import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { campaigns } from "../db/schema.js";
import { notFound } from "../lib/errors.js";

export const campaignsRouter = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  utmCampaign: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/, "英小文字・数字・ハイフン・アンダースコアのみ"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  goalRegistrations: z.number().int().min(0).optional(),
  status: z.enum(["active", "paused", "completed"]).default("active"),
});

const updateSchema = createSchema.partial();

// GET /api/campaigns
campaignsRouter.get("/", async (c) => {
  const rows = await db.query.campaigns.findMany({
    orderBy: [desc(campaigns.status), desc(campaigns.id)],
    with: { posts: { columns: { id: true } } },
  });
  return c.json(rows);
});

// GET /api/campaigns/:id
campaignsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, id),
    with: {
      posts: {
        columns: { id: true, platform: true, status: true, postedAt: true },
      },
    },
  });
  if (!campaign) throw notFound("Campaign not found");
  return c.json(campaign);
});

// POST /api/campaigns
campaignsRouter.post("/", zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const [campaign] = await db.insert(campaigns).values(data).returning();
  return c.json(campaign, 201);
});

// PUT /api/campaigns/:id
campaignsRouter.put("/:id", zValidator("json", updateSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");
  const [updated] = await db
    .update(campaigns)
    .set(data)
    .where(eq(campaigns.id, id))
    .returning();
  if (!updated) throw notFound("Campaign not found");
  return c.json(updated);
});

// DELETE /api/campaigns/:id
campaignsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [deleted] = await db.delete(campaigns).where(eq(campaigns.id, id)).returning();
  if (!deleted) throw notFound("Campaign not found");
  return c.json({ success: true });
});
