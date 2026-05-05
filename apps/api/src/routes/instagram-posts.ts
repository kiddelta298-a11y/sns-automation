import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join, extname, basename } from "path";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts } from "../db/schema.js";
import { instagramPostQueue } from "../lib/queues.js";

// 画像格納ディレクトリ（タスク#13で作成済み）
const UPLOADS_BASE = "/home/himawari_pchimawari_pc/projects/sns-automation/apps/worker/data/instagram-uploads";

function pendingDir(accountUsername: string) {
  return join(UPLOADS_BASE, accountUsername, "pending");
}

const SUPPORTED_EXT = new Set([".jpg", ".jpeg", ".png"]);

interface MetaJson {
  caption?: string;
  affiliateUrl?: string;
  affiliateLabel?: string;
  platforms?: ("feed" | "story")[];
}

function readMetaJson(imagePath: string): MetaJson | null {
  const dir = join(imagePath, "..");
  const stem = basename(imagePath, extname(imagePath));
  const metaPath = join(dir, `${stem}.json`);
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, "utf-8")) as MetaJson;
  } catch {
    return null;
  }
}

export const instagramPostsRouter = new Hono();

// GET /api/instagram/posts/pending?account=natalia_r_29 — pending画像一覧
instagramPostsRouter.get("/pending", (c) => {
  const account = c.req.query("account");
  if (!account) return c.json({ error: "account query required" }, 400);
  const dir = pendingDir(account);
  if (!existsSync(dir)) return c.json({ images: [] });

  const images = readdirSync(dir)
    .filter((f) => SUPPORTED_EXT.has(extname(f).toLowerCase()))
    .map((f) => {
      const fullPath = join(dir, f);
      const { size, mtime } = statSync(fullPath);
      const meta = readMetaJson(fullPath);
      return {
        filename: f,
        path: fullPath,
        size,
        updatedAt: mtime.toISOString(),
        meta,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return c.json({ images });
});

// POST /api/instagram/posts/from-folder — pending配下を一括キュー投入
const fromFolderSchema = z.object({
  account: z.string().min(1),
  // 投稿対象のファイル名（指定がなければpendingの全画像）
  filenames: z.array(z.string().min(1)).optional(),
  // 投稿先 ("feed" のみ / "story" のみ / 両方)。デフォルトは ["feed"]
  modes: z.array(z.enum(["feed", "story"])).min(1).optional(),
  // 投稿間隔（秒）。レート制限対策。デフォルト60秒
  intervalSec: z.number().int().min(0).max(3600).optional(),
  // ヘッドレス可否（デフォルトtrue）
  headless: z.boolean().optional(),
  // 一括上書きするキャプション（空ならGemini自動生成 — 後続タスクで実装）
  captionOverride: z.string().optional(),
  // 一括上書きするアフィリエイトURL/Label（空ならアカウントDB値）
  affiliateUrlOverride: z.string().url().optional(),
  affiliateLabelOverride: z.string().max(60).optional(),
});

instagramPostsRouter.post("/from-folder", zValidator("json", fromFolderSchema), async (c) => {
  const body = c.req.valid("json");
  const dir = pendingDir(body.account);
  if (!existsSync(dir)) return c.json({ error: "pending directory not found" }, 404);

  // アカウント情報（アフィリエイトURL/Label・パスワード）取得
  const account = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.platform, "instagram"),
      eq(accounts.username, body.account),
    ),
  });
  if (!account) return c.json({ error: "account not found in DB" }, 404);

  const creds = (account.credentials ?? {}) as Record<string, unknown>;
  const password = (creds.password as string | undefined) ?? process.env.INSTAGRAM_PASSWORD;
  if (!password) {
    return c.json({ error: "password not available (DB credentials.password or INSTAGRAM_PASSWORD env required)" }, 400);
  }

  const allFiles = readdirSync(dir).filter((f) => SUPPORTED_EXT.has(extname(f).toLowerCase()));
  const targets = body.filenames && body.filenames.length > 0
    ? allFiles.filter((f) => body.filenames!.includes(f))
    : allFiles;

  if (targets.length === 0) return c.json({ error: "no target images" }, 400);

  const intervalSec = body.intervalSec ?? 60;
  const modes = body.modes ?? ["feed"];

  const enqueued: { postId: string; jobId: string | undefined; filename: string }[] = [];

  for (let i = 0; i < targets.length; i++) {
    const filename = targets[i];
    const imagePath = join(dir, filename);
    const meta = readMetaJson(imagePath);

    const postId = crypto.randomUUID();
    const caption = body.captionOverride ?? meta?.caption ?? ""; // 空ならworkerでGemini生成（タスク#19で連携予定）
    const affiliateUrl = body.affiliateUrlOverride ?? meta?.affiliateUrl ?? account.affiliateUrl ?? undefined;
    const affiliateLabel = body.affiliateLabelOverride ?? meta?.affiliateLabel ?? account.affiliateLabel ?? undefined;
    const jobModes = (meta?.platforms ?? modes) as ("feed" | "story")[];

    const job = await instagramPostQueue.add(
      `ig-post-${postId}`,
      {
        postId,
        username: body.account,
        password,
        caption,
        imagePaths: [imagePath],
        modes: jobModes,
        affiliateUrl,
        affiliateLabel,
        headless: body.headless ?? true,
      },
      {
        jobId: `ig-post-${postId}`,
        delay: i * intervalSec * 1000,
      },
    );
    enqueued.push({ postId, jobId: job.id, filename });
  }

  return c.json({ enqueued, count: enqueued.length, intervalSec, modes }, 202);
});
