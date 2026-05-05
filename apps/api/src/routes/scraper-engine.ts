import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getSetting, setSetting, SETTING_KEYS } from "../lib/settings.js";

export const scraperEngineRouter = new Hono();

const ALLOWED_ENGINES = ["scrapling", "playwright"] as const;
type ScraperEngine = (typeof ALLOWED_ENGINES)[number];

const engineSchema = z.object({
  engine: z.enum(ALLOWED_ENGINES),
});

// GET /api/scraper-engine — 現在のエンジン設定を返す
scraperEngineRouter.get("/", async (c) => {
  const raw = await getSetting(SETTING_KEYS.THREADS_SCRAPER_ENGINE);
  const engine: ScraperEngine =
    raw === "scrapling" ? "scrapling" : "playwright";
  return c.json({ engine });
});

// POST /api/scraper-engine — エンジン設定を更新（DB + 環境変数に即時反映）
scraperEngineRouter.post(
  "/",
  zValidator("json", engineSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "engine must be 'scrapling' or 'playwright'" },
        400,
      );
    }
  }),
  async (c) => {
    const { engine } = c.req.valid("json");
    await setSetting(SETTING_KEYS.THREADS_SCRAPER_ENGINE, engine);
    return c.json({ engine, updated: true });
  },
);
