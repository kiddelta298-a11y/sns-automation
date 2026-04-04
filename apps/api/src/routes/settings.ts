import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getAllSettings, setSetting, SETTING_KEYS } from "../lib/settings.js";

export const settingsRouter = new Hono();

// GET /api/settings — 全設定取得（APIキーはマスク済み）
settingsRouter.get("/", async (c) => {
  const settings = await getAllSettings();
  return c.json(settings);
});

// PUT /api/settings — 設定を一括更新
settingsRouter.put("/", zValidator("json", z.record(z.string())), async (c) => {
  const updates = c.req.valid("json");
  for (const [key, value] of Object.entries(updates)) {
    await setSetting(key, String(value));
  }
  const settings = await getAllSettings();
  return c.json(settings);
});

// PUT /api/settings/:key — 単一設定を更新
settingsRouter.put("/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json<{ value: string }>();
  if (body.value === undefined) return c.json({ error: "value required" }, 400);
  await setSetting(key, String(body.value));
  return c.json({ key, updated: true });
});
