import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { instagramStoryQueue } from "../lib/queues.js";

const STORY_UPLOADS_DIR = "/home/himawari_pchimawari_pc/projects/sns-automation/uploads/instagram-stories";

const instagramStorySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  imagePath: z.string().min(1),
  textOverlay: z.string().optional(),
  affiliateLink: z.string().url().optional(),
  linkText: z.string().optional(),
});

export const instagramStoryRouter = new Hono();

// GET /api/instagram/stories/uploads — 画像フォルダのファイル一覧
instagramStoryRouter.get("/uploads", (c) => {
  try {
    const files = readdirSync(STORY_UPLOADS_DIR)
      .filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f))
      .map((f) => {
        const fullPath = join(STORY_UPLOADS_DIR, f);
        const { size, mtime } = statSync(fullPath);
        return { filename: f, path: fullPath, size, updatedAt: mtime.toISOString() };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return c.json(files);
  } catch {
    return c.json([]);
  }
});

// POST /api/instagram/story
instagramStoryRouter.post(
  "/",
  zValidator("json", instagramStorySchema),
  async (c) => {
    const data = c.req.valid("json");
    const postId = crypto.randomUUID();

    const job = await instagramStoryQueue.add(`story-${postId}`, {
      postId,
      ...data,
    });

    return c.json({ jobId: job.id, status: "queued" }, 202);
  },
);
