import { Worker, Queue, type Job } from "bullmq";
import IORedis from "ioredis";
import { ThreadsBrowser, type ThreadsPostResult } from "../browser/threads.js";

// ---------------------------------------------------------------
// Redis 接続
// ---------------------------------------------------------------
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Cast to any: bullmq's ConnectionOptions expects newer ioredis type with
// Redis 7.4+ commands (hgetdel, hexpireat, etc.) that we don't use.
export const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
}) as any;

// ---------------------------------------------------------------
// キュー定義
// ---------------------------------------------------------------
export const QUEUE_NAME = "post-to-threads";

export const threadsPostQueue = new Queue(QUEUE_NAME, {
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
export interface PostToThreadsJobData {
  /** 投稿 DB ID */
  postId: string;
  /** アカウントユーザー名 */
  username: string;
  /** アカウントパスワード（環境変数キーまたは直値） */
  password: string;
  /** 投稿テキスト */
  text: string;
  /** 画像ファイルパス */
  imagePaths?: string[];
  /** ヘッドレスモード */
  headless?: boolean;
  /** プロキシ設定 */
  proxy?: { server: string; username?: string; password?: string };
}

export interface PostToThreadsJobResult {
  postId: string;
  result: ThreadsPostResult;
}

// ---------------------------------------------------------------
// ワーカー
// ---------------------------------------------------------------
export function createThreadsPostWorker(): Worker<
  PostToThreadsJobData,
  PostToThreadsJobResult
> {
  const worker = new Worker<PostToThreadsJobData, PostToThreadsJobResult>(
    QUEUE_NAME,
    async (job: Job<PostToThreadsJobData>) => {
      const { postId, username, password, text, imagePaths, headless, proxy } =
        job.data;

      console.log(`[job:${job.id}] Processing post ${postId} for @${username}`);
      await job.updateProgress(10);

      const browser = new ThreadsBrowser(
        { username, password },
        { headless: headless ?? true, proxy },
      );

      try {
        // ブラウザ初期化
        await browser.init();
        await job.updateProgress(30);

        // ログイン
        await browser.login();
        await job.updateProgress(50);

        // 投稿
        const result = await browser.post({ text, imagePaths });
        await job.updateProgress(90);

        if (!result.success) {
          throw new Error(result.error ?? "Post failed");
        }

        console.log(`[job:${job.id}] Post ${postId} completed successfully`);
        await job.updateProgress(100);

        return { postId, result };
      } finally {
        await browser.close();
      }
    },
    {
      connection,
      concurrency: 1, // Threads の操作は 1 並行に制限
      limiter: {
        max: 5,
        duration: 60_000 * 60, // 1時間あたり最大 5 投稿
      },
    },
  );

  // イベントリスナー
  worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] Job ${job?.id} failed: ${err.message}`);
  });

  worker.on("error", (err) => {
    console.error(`[worker] Worker error: ${err.message}`);
  });

  return worker;
}

// ---------------------------------------------------------------
// ジョブ投入ヘルパー
// ---------------------------------------------------------------
export async function enqueueThreadsPost(
  data: PostToThreadsJobData,
): Promise<string> {
  const job = await threadsPostQueue.add(`post-${data.postId}`, data, {
    jobId: `threads-post-${data.postId}`,
  });
  console.log(`[queue] Enqueued post ${data.postId} as job ${job.id}`);
  return job.id!;
}
