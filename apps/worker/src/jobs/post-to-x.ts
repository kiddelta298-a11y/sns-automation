import { Worker, Queue, type Job } from "bullmq";
import IORedis from "ioredis";
import { sql } from "drizzle-orm";
import { XBrowser, type XPostResult } from "../browser/x.js";
import { getDb } from "../db/index.js";

// ---------------------------------------------------------------
// Redis 接続（post-to-threads と共有しても良いが、独立させておく）
// ---------------------------------------------------------------
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Cast to any: bullmq's ConnectionOptions expects newer ioredis type.
export const xConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
}) as any;

export const QUEUE_NAME = "post-to-x";

export const xPostQueue = new Queue(QUEUE_NAME, {
  connection: xConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

// ---------------------------------------------------------------
// ジョブデータ
// ---------------------------------------------------------------
export interface PostToXJobData {
  postId: string;
  username: string;
  /** 対話型ログインで取得した storageState JSON（推奨） */
  storageState?: Record<string, unknown>;
  /** フォールバック: パスワード */
  password?: string;
  text: string;
  imagePaths?: string[];
  headless?: boolean;
  /** Xアカウントごとに固定プロキシを当てる */
  proxy?: { server: string; username?: string; password?: string };
}

export interface PostToXJobResult {
  postId: string;
  result: XPostResult;
}

// ---------------------------------------------------------------
// ワーカー
// ---------------------------------------------------------------
export function createXPostWorker(): Worker<PostToXJobData, PostToXJobResult> {
  const worker = new Worker<PostToXJobData, PostToXJobResult>(
    QUEUE_NAME,
    async (job: Job<PostToXJobData>) => {
      const { postId, username, storageState, password, text, imagePaths, headless, proxy } =
        job.data;

      console.log(`[job:${job.id}] Processing X post ${postId} for @${username}`);
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
        SELECT gen_random_uuid(), ${jobId}, 'x', ${text}, 'running', NOW(), NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM updated)
      `);

      const browser = new XBrowser(
        { username, storageState, password },
        { headless: headless ?? true, proxy },
      );

      try {
        await browser.init();
        await job.updateProgress(30);

        await browser.login();
        await job.updateProgress(50);

        const result = await browser.post({ text, imagePaths });
        await job.updateProgress(90);

        if (!result.success) {
          throw new Error(result.error ?? "Post failed");
        }

        // 成功: completed に更新
        await db.execute(sql`
          UPDATE post_history
          SET status = 'completed', completed_at = NOW(), updated_at = NOW()
          WHERE job_id = ${jobId}
        `);

        console.log(`[job:${job.id}] X post ${postId} completed`);
        await job.updateProgress(100);
        return { postId, result };
      } catch (err) {
        // 失敗: failed に更新
        const errMsg = err instanceof Error ? err.message : String(err);
        await db.execute(sql`
          UPDATE post_history
          SET status = 'failed', error_message = ${errMsg}, completed_at = NOW(), updated_at = NOW()
          WHERE job_id = ${jobId}
        `).catch(() => {});
        throw err;
      } finally {
        await browser.close();
      }
    },
    {
      connection: xConnection,
      concurrency: 1,
      limiter: {
        max: 10,
        duration: 60_000 * 60, // 1時間あたり最大10投稿
      },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[worker:x] Job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[worker:x] Job ${job?.id} failed: ${err.message}`);
  });
  worker.on("error", (err) => {
    console.error(`[worker:x] Worker error: ${err.message}`);
  });

  return worker;
}

// ---------------------------------------------------------------
// ジョブ投入ヘルパー
// ---------------------------------------------------------------
export async function enqueueXPost(data: PostToXJobData): Promise<string> {
  const job = await xPostQueue.add(`post-${data.postId}`, data, {
    jobId: `x-post-${data.postId}`,
  });
  console.log(`[queue] Enqueued X post ${data.postId} as job ${job.id}`);
  return job.id!;
}
