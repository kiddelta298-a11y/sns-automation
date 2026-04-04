import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { industries } from "../db/schema.js";
import { createIndustrySchema } from "../lib/validators.js";
import { INDUSTRY_PRESETS } from "../db/industry-seeds.js";

export const industriesRouter = new Hono();

// GET /api/industries — 業界一覧
industriesRouter.get("/", async (c) => {
  const results = await db.query.industries.findMany({
    orderBy: (t, { asc }) => [asc(t.name)],
  });
  return c.json(results);
});

// POST /api/industries/seed — プリセット業界を投入（初回セットアップ）
industriesRouter.post("/seed", async (c) => {
  const inserted: string[] = [];
  for (const preset of INDUSTRY_PRESETS) {
    const existing = await db.query.industries.findFirst({
      where: eq(industries.slug, preset.slug),
    });
    if (!existing) {
      await db.insert(industries).values({
        name: preset.name,
        slug: preset.slug,
        description: preset.description,
        keywords: [...preset.keywords],
        isPreset: true,
      });
      inserted.push(preset.slug);
    }
  }
  return c.json({ seeded: inserted.length, slugs: inserted });
});

// POST /api/industries — カスタム業界作成
industriesRouter.post("/", zValidator("json", createIndustrySchema), async (c) => {
  const data = c.req.valid("json");
  const [industry] = await db.insert(industries).values({
    ...data,
    isPreset: false,
  }).returning();
  return c.json(industry, 201);
});

// GET /api/industries/:id
industriesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const industry = await db.query.industries.findFirst({
    where: eq(industries.id, id),
  });
  if (!industry) return c.json({ error: "Not found" }, 404);
  return c.json(industry);
});

// DELETE /api/industries/:id（カスタムのみ削除可）
industriesRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const industry = await db.query.industries.findFirst({
    where: eq(industries.id, id),
  });
  if (!industry) return c.json({ error: "Not found" }, 404);
  if (industry.isPreset) return c.json({ error: "Cannot delete preset industry" }, 400);
  await db.delete(industries).where(eq(industries.id, id));
  return c.json({ message: "Deleted" });
});
