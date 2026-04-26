import { Worker, Queue, type Job } from "bullmq";
import IORedis from "ioredis";
import { sql } from "drizzle-orm";
import { ThreadsBrowser, stripExternalLinks, type ThreadsPostResult } from "../browser/threads.js";
import { getDb } from "../db/index.js";

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
    // 重複投稿防止: BullMQ レベルでは再試行しない。
    // publish クリック以降の失敗を再試行すると Threads 側で二重投稿になるため、
    // リトライは scheduler 側 (scheduled_posts.retry_count) で明示的に制御する。
    attempts: 1,
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
  /** アカウント DB ID（セッション保存に使用） */
  accountId?: string;
  /** scheduled_posts.id（進捗記録・スクリーンショット命名に使用） */
  scheduledId?: string;
  /** アカウントユーザー名 */
  username: string;
  /** アカウントパスワード（環境変数キーまたは直値） */
  password: string;
  /** DB 保存済み Playwright storageState（あればログインスキップ） */
  storageState?: Record<string, unknown>;
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
      const { postId, accountId, scheduledId, username, password, storageState, text, imagePaths, headless, proxy } =
        job.data;

      console.log(`[job:${job.id}] Processing post ${postId} for @${username}`);
      await job.updateProgress(10);

      const db = getDb();
      const jobId = job.id!;

      // べき等性チェック: 既に投稿済みならスキップ（BullMQリトライによる二重投稿防止）
      if (scheduledId) {
        const rows = await db.execute(sql`
          SELECT executed_at FROM scheduled_posts WHERE id = ${scheduledId}
        `);
        if (rows[0]?.executed_at) {
          console.log(`[job:${job.id}] Already posted (scheduledId=${scheduledId}), skipping`);
          await job.updateProgress(100);
          return { postId, result: { success: true } as ThreadsPostResult };
        }
      }

      // 外部リンク除去は browser.post() 内でも実施されるが、post_history.content を
      // 投稿後テキストと一致させるためここでも適用しておく（同じ実装で揃える）。
      const cleanText = stripExternalLinks(text);
      if (cleanText !== text) {
        console.log(`[job:${job.id}] Stripped URLs from post text`);
      }

      // ジョブ開始: running に更新（pending レコードがなければ INSERT）
      await db.execute(sql`
        WITH updated AS (
          UPDATE post_history
          SET status = 'running', started_at = NOW(), updated_at = NOW()
          WHERE job_id = ${jobId} AND status = 'pending'
          RETURNING id
        )
        INSERT INTO post_history (id, job_id, platform, content, status, started_at, created_at, updated_at)
        SELECT gen_random_uuid(), ${jobId}, 'threads', ${cleanText}, 'running', NOW(), NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM updated)
      `);

      // DB 保存済み storageState があればログインスキップのため注入
      const browser = new ThreadsBrowser(
        { username, password },
        { headless: headless ?? true, proxy, ...(storageState ? { storageState } : {}) },
      );

      try {
        // ブラウザ初期化
        await browser.init();
        await job.updateProgress(30);

        // ログイン（storageState 注入済みの場合は isLoggedIn() でスキップされる）
        await browser.login();
        await job.updateProgress(50);

        // ステージ進捗: login完了 (25%)
        if (scheduledId) {
          await db.execute(sql`
            UPDATE scheduled_posts
            SET current_stage = 'login', progress_pct = 25
            WHERE id = ${scheduledId}
          `).catch(() => {});
        }

        // ステージ進捗コールバック（threads.ts → DB 更新）
        const onStageProgress = scheduledId
          ? async (stage: string, pct: number) => {
              await db.execute(sql`
                UPDATE scheduled_posts
                SET current_stage = ${stage}, progress_pct = ${pct}
                WHERE id = ${scheduledId}
              `).catch(() => {});
            }
          : undefined;

        // 投稿（URL除去済みテキストを使用）
        const result = await browser.post({ text: cleanText, imagePaths, scheduledId }, onStageProgress);
        await job.updateProgress(90);
        console.log(`[job:${job.id}] post result: success=${result.success} platformPostId=${result.platformPostId ?? 'null'} screenshotPath=${result.screenshotPath ?? 'null'} postUrl=${result.postUrl ?? 'null'}`);

        if (!result.success) {
          throw new Error(result.error ?? "Post failed");
        }

        // セッションを DB に永続化（次回ログインスキップ・IPブロック対策）
        if (accountId) {
          try {
            const newStorageState = await browser.getStorageState();
            await db.execute(sql`
              UPDATE accounts
              SET credentials = jsonb_set(
                    COALESCE(credentials, '{}'),
                    '{storageState}',
                    ${JSON.stringify(newStorageState)}::jsonb
                  ),
                  updated_at = NOW()
              WHERE id = ${accountId}
            `);
            console.log(`[job:${job.id}] Session persisted for account ${accountId}`);
          } catch (e) {
            console.warn(`[job:${job.id}] Failed to persist session:`, e);
          }
        }

        // 投稿成功情報を scheduled_posts に記録（executed_at + platform_post_id + screenshot_path）
        if (scheduledId) {
          await db.execute(sql`
            UPDATE scheduled_posts
            SET executed_at = NOW(),
                platform_post_id = ${result.platformPostId ?? null},
                screenshot_path = ${result.screenshotPath ?? null}
            WHERE id = ${scheduledId}
          `).catch((e) => console.warn(`[job:${job.id}] Failed to update scheduled_posts:`, e));
        }

        // posts テーブルにも platform_post_id を同期（投稿一覧・詳細ページのデータソース）
        if (result.platformPostId) {
          await db.execute(sql`
            UPDATE posts
            SET platform_post_id = ${result.platformPostId},
                updated_at = NOW()
            WHERE id = ${postId}
          `).catch((e) => console.warn(`[job:${job.id}] Failed to sync posts.platform_post_id:`, e));
        }

        // 成功: completed に更新
        await db.execute(sql`
          UPDATE post_history
          SET status = 'completed', completed_at = NOW(), updated_at = NOW()
          WHERE job_id = ${jobId}
        `);

        console.log(`[job:${job.id}] Post ${postId} completed successfully`);
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
