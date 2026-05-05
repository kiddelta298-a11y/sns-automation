import { Worker, Queue, type Job } from "bullmq";
import { createWriteStream, mkdirSync, renameSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, extname, dirname, basename } from "path";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import {
  InstagramBrowser,
  type InstagramPostResult,
  type InstagramStoryResult,
} from "../browser/instagram.js";
import { connection } from "./post-to-threads.js";
import { getDb } from "../db/index.js";
import { generateInstagramCaption } from "./generate-caption.js";

/**
 * URL の場合はローカルの一時ファイルにダウンロードして返す。
 * ローカルパスの場合はそのまま返す。
 */
async function resolveImagePaths(paths: string[]): Promise<{ resolved: string[]; tmpFiles: string[] }> {
  const tmpDir = join(tmpdir(), "sns-uploads");
  mkdirSync(tmpDir, { recursive: true });
  const resolved: string[] = [];
  const tmpFiles: string[] = [];

  for (const p of paths) {
    if (p.startsWith("http://") || p.startsWith("https://")) {
      const res = await fetch(p);
      if (!res.ok) throw new Error(`Failed to download image: ${p}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = extname(new URL(p).pathname) || ".jpg";
      const tmpPath = join(tmpDir, `${randomUUID()}${ext}`);
      await new Promise<void>((resolve, reject) => {
        const ws = createWriteStream(tmpPath);
        ws.write(buf, (err) => {
          if (err) reject(err);
          else { ws.end(); ws.on("finish", resolve); ws.on("error", reject); }
        });
      });
      resolved.push(tmpPath);
      tmpFiles.push(tmpPath);
    } else {
      resolved.push(p);
    }
  }
  return { resolved, tmpFiles };
}

/**
 * pending/ 配下の画像を posted/ または failed/ に移動する。
 * - 画像パスが instagram-uploads/<account>/pending/<file> パターンなら移動
 * - 一致しないパス（一時ファイル等）はそのまま返す
 * 返り値は移動後（または非該当時は元）のパス配列。
 */
function movePendingImages(originalPaths: string[], destSubdir: "posted" | "failed"): string[] {
  const moved: string[] = [];
  for (const p of originalPaths) {
    const dir = dirname(p);
    if (basename(dir) !== "pending") {
      moved.push(p);
      continue;
    }
    const accountDir = dirname(dir);
    const targetDir = join(accountDir, destSubdir);
    try {
      mkdirSync(targetDir, { recursive: true });
      const target = join(targetDir, basename(p));
      if (existsSync(p)) {
        renameSync(p, target);
        // 同名 .json (meta) も移動する
        const metaSrc = p.replace(/\.[^.]+$/, ".json");
        if (existsSync(metaSrc)) {
          renameSync(metaSrc, target.replace(/\.[^.]+$/, ".json"));
        }
        moved.push(target);
      } else {
        moved.push(p);
      }
    } catch (err) {
      console.warn(`[move] Failed to move ${p} -> ${destSubdir}:`, err instanceof Error ? err.message : err);
      moved.push(p);
    }
  }
  return moved;
}

// ---------------------------------------------------------------
// キュー定義
// ---------------------------------------------------------------
export const QUEUE_NAME = "post-to-instagram";

export const instagramPostQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

// ---------------------------------------------------------------
// ジョブデータ型
// ---------------------------------------------------------------
export interface PostToInstagramJobData {
  /** 投稿 DB ID */
  postId: string;
  /** アカウントユーザー名 */
  username: string;
  /** アカウントパスワード（環境変数キーまたは直値） */
  password: string;
  /** キャプション */
  caption: string;
  /** 画像ファイルパス（最低1枚必須） */
  imagePaths: string[];
  /** 投稿先 (feed のみ / story のみ / 両方)。デフォルト ["feed"] */
  modes?: ("feed" | "story")[];
  /** アフィリエイトURL（フィードのリンク機能 / ストーリーリンクスタンプ用） */
  affiliateUrl?: string;
  /** リンクラベル文言（CTA） */
  affiliateLabel?: string;
  /** ヘッドレスモード */
  headless?: boolean;
  /** プロキシ設定 */
  proxy?: { server: string; username?: string; password?: string };
}

export interface PostToInstagramJobResult {
  postId: string;
  result: InstagramPostResult;
}

// ---------------------------------------------------------------
// ワーカー
// ---------------------------------------------------------------
export function createInstagramPostWorker(): Worker<
  PostToInstagramJobData,
  PostToInstagramJobResult
> {
  const worker = new Worker<PostToInstagramJobData, PostToInstagramJobResult>(
    QUEUE_NAME,
    async (job: Job<PostToInstagramJobData>) => {
      const {
        postId,
        username,
        password,
        caption,
        imagePaths,
        modes = ["feed"],
        affiliateUrl,
        affiliateLabel,
        headless,
        proxy,
      } = job.data;

      console.log(
        `[job:${job.id}] Processing Instagram post ${postId} for @${username}`,
      );
      await job.updateProgress(10);

      const db = getDb();
      const jobId = job.id!;

      // ジョブ開始: running に更新（pending レコードがなければ INSERT）
      await db.execute(sql`
        WITH updated AS (
          UPDATE post_history
          SET status = 'running', started_at = NOW(), updated_at = NOW()
          WHERE job_id = ${jobId} AND status = 'pending'
          RETURNING id
        )
        INSERT INTO post_history (id, job_id, platform, content, status, started_at, created_at, updated_at)
        SELECT gen_random_uuid(), ${jobId}, 'instagram', ${caption}, 'running', NOW(), NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM updated)
      `);

      const browser = new InstagramBrowser(
        { username, password },
        { headless: headless ?? true, proxy },
      );

      const { resolved: resolvedPaths, tmpFiles } = await resolveImagePaths(imagePaths);

      // キャプションが空ならGemini Visionで自動生成（最初の画像で）
      let effectiveCaption = caption;
      if (!effectiveCaption.trim() && resolvedPaths.length > 0) {
        try {
          const gen = await generateInstagramCaption({
            imagePath: resolvedPaths[0],
            appendUrl: affiliateUrl,
            urlPrefix: affiliateLabel,
          });
          effectiveCaption = gen.caption;
          console.log(`[job:${job.id}] Caption auto-generated (${gen.model}): ${effectiveCaption.slice(0, 60)}...`);
        } catch (err) {
          console.warn(`[job:${job.id}] Caption generation failed: ${err instanceof Error ? err.message : err}`);
        }
      }

      try {
        // ブラウザ初期化
        await browser.init();
        await job.updateProgress(30);

        // ログイン
        await browser.login();
        await job.updateProgress(50);

        // 投稿（feed / story / 両方）
        let feedResult: InstagramPostResult | null = null;
        if (modes.includes("feed")) {
          feedResult = await browser.post({
            caption: effectiveCaption,
            imagePaths: resolvedPaths,
            affiliateUrl,
            affiliateLabel,
          });
          if (!feedResult.success) {
            throw new Error(feedResult.error ?? "Instagram feed post failed");
          }
        }

        if (modes.includes("story")) {
          const storyResult = await browser.postStory({
            imagePath: resolvedPaths[0],
            textOverlay: effectiveCaption || undefined,
            affiliateLink: affiliateUrl,
            linkText: affiliateLabel,
          });
          if (!storyResult.success) {
            console.warn(`[job:${job.id}] Story post failed: ${storyResult.error}`);
            if (!feedResult) {
              throw new Error(storyResult.error ?? "Instagram story post failed");
            }
          }
        }

        const result = feedResult ?? { success: true };
        await job.updateProgress(90);

        // 投稿成功: pending/ → posted/ に画像を移動
        const movedPaths = movePendingImages(imagePaths, "posted");

        // 成功: completed に更新（投稿URL・画像パスも保存）
        await db.execute(sql`
          UPDATE post_history
          SET status = 'completed',
              completed_at = NOW(),
              updated_at = NOW(),
              post_url = ${result.postUrl ?? null},
              content = ${effectiveCaption},
              image_paths = ${JSON.stringify(movedPaths)}::jsonb
          WHERE job_id = ${jobId}
        `);

        console.log(
          `[job:${job.id}] Instagram post ${postId} completed successfully (url=${result.postUrl ?? "n/a"})`,
        );
        await job.updateProgress(100);

        return { postId, result };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        // 投稿失敗: pending/ → failed/ に画像を移動（再試行を諦めた最終attemptのみ）
        const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        let failedPaths: string[] | null = null;
        if (isFinalAttempt) {
          failedPaths = movePendingImages(imagePaths, "failed");
        }

        await db.execute(sql`
          UPDATE post_history
          SET status = 'failed',
              error_message = ${errMsg},
              completed_at = NOW(),
              updated_at = NOW(),
              image_paths = ${JSON.stringify(failedPaths ?? imagePaths)}::jsonb
          WHERE job_id = ${jobId}
        `).catch(() => {});
        throw err;
      } finally {
        await browser.close();
        for (const f of tmpFiles) {
          try { (await import("fs")).unlinkSync(f); } catch { /* ignore */ }
        }
      }
    },
    {
      connection,
      concurrency: 1, // Instagram の操作は 1 並行に制限
      limiter: {
        max: 5,
        duration: 60_000 * 60, // 1時間あたり最大 5 投稿
      },
    },
  );

  // イベントリスナー
  worker.on("completed", (job) => {
    console.log(`[worker] Instagram job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[worker] Instagram job ${job?.id} failed: ${err.message}`,
    );
  });

  worker.on("error", (err) => {
    console.error(`[worker] Instagram worker error: ${err.message}`);
  });

  return worker;
}

// ---------------------------------------------------------------
// ジョブ投入ヘルパー
// ---------------------------------------------------------------
export async function enqueueInstagramPost(
  data: PostToInstagramJobData,
): Promise<string> {
  const job = await instagramPostQueue.add(`post-${data.postId}`, data, {
    jobId: `ig-post-${data.postId}`,
  });
  console.log(`[queue] Enqueued Instagram post ${data.postId} as job ${job.id}`);
  return job.id!;
}

// ---------------------------------------------------------------
// ストーリー: ジョブデータ型
// ---------------------------------------------------------------
export interface PostToInstagramStoryJobData {
  postId: string;
  username: string;
  password: string;
  imagePath: string;
  textOverlay?: string;
  affiliateLink?: string;
  linkText?: string;
  headless?: boolean;
}

// ---------------------------------------------------------------
// ストーリー: キュー定義
// ---------------------------------------------------------------
export const STORY_QUEUE_NAME = "post-to-instagram-story";

export const instagramStoryQueue = new Queue<PostToInstagramStoryJobData>(
  STORY_QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 7 * 24 * 3600 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  },
);

// ---------------------------------------------------------------
// ストーリー: ワーカー
// ---------------------------------------------------------------
export function createInstagramStoryWorker(): Worker<
  PostToInstagramStoryJobData,
  InstagramStoryResult
> {
  const worker = new Worker<PostToInstagramStoryJobData, InstagramStoryResult>(
    STORY_QUEUE_NAME,
    async (job: Job<PostToInstagramStoryJobData>) => {
      const { postId, username, password, imagePath, textOverlay, affiliateLink, linkText, headless } =
        job.data;

      console.log(
        `[job:${job.id}] Processing Instagram story ${postId} for @${username}`,
      );
      await job.updateProgress(10);

      const browser = new InstagramBrowser(
        { username, password },
        { headless: headless ?? true },
      );

      try {
        await browser.init();
        await job.updateProgress(30);

        await browser.login();
        await job.updateProgress(50);

        const result = await browser.postStory({
          imagePath,
          textOverlay,
          affiliateLink,
          linkText,
        } as Parameters<typeof browser.postStory>[0]);
        await job.updateProgress(90);

        if (!result.success) {
          throw new Error(result.error ?? "Instagram story post failed");
        }

        console.log(
          `[job:${job.id}] Instagram story ${postId} completed successfully`,
        );
        await job.updateProgress(100);

        return result;
      } finally {
        await browser.close();
      }
    },
    {
      connection,
      concurrency: 1,
      limiter: {
        max: 10,
        duration: 60_000 * 60,
      },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[worker] Instagram story job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] Instagram story job ${job?.id} failed: ${err.message}`);
  });

  worker.on("error", (err) => {
    console.error(`[worker] Instagram story worker error: ${err.message}`);
  });

  return worker;
}
