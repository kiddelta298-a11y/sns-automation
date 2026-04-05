import { lte, eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { threadsPostQueue } from "./post-to-threads.js";
import { instagramPostQueue } from "./post-to-instagram.js";

const CHECK_INTERVAL_MS = 60_000; // 1分ごとに確認
const MAX_RETRY = 3;

/**
 * pending かつ scheduledAt を過ぎた予約投稿を取得してキューに投入する
 */
async function executePendingPosts(): Promise<void> {
  const db = getDb();

  // DB スキーマをインライン定義（workerはAPIのschema.tsを直接参照できないため）
  const { sql } = await import("drizzle-orm");

  const rows = await db.execute(sql`
    SELECT
      sp.id        AS scheduled_id,
      sp.post_id,
      sp.retry_count,
      p.platform,
      p.content_text,
      p.link_url,
      p.metadata,
      a.username,
      a.credentials,
      a.proxy_config
    FROM scheduled_posts sp
    JOIN posts p ON p.id = sp.post_id
    JOIN accounts a ON a.id = p.account_id
    WHERE sp.status = 'pending'
      AND sp.scheduled_at <= NOW()
    ORDER BY sp.scheduled_at ASC
    LIMIT 20
  `);

  if (rows.length === 0) return;

  console.log(`[scheduler] ${rows.length} scheduled post(s) to process`);

  for (const row of rows) {
    const scheduledId = row.scheduled_id as string;
    const postId = row.post_id as string;
    const platform = row.platform as string;
    const retryCount = (row.retry_count as number) ?? 0;

    if (retryCount >= MAX_RETRY) {
      await db.execute(sql`
        UPDATE scheduled_posts
        SET status = 'failed', error_message = 'Max retries exceeded'
        WHERE id = ${scheduledId}
      `);
      await db.execute(sql`
        UPDATE posts SET status = 'failed', updated_at = NOW()
        WHERE id = ${postId}
      `);
      continue;
    }

    // processing に更新してキューへ投入
    await db.execute(sql`
      UPDATE scheduled_posts
      SET status = 'processing', retry_count = retry_count + 1
      WHERE id = ${scheduledId}
    `);

    const credentials = row.credentials as Record<string, string>;
    const proxyConfig = row.proxy_config as { server: string; username?: string; password?: string } | null;
    const headless = process.env.HEADLESS !== "false";

    try {
      if (platform === "threads") {
        const job = await threadsPostQueue.add(
          `scheduled-${scheduledId}`,
          {
            postId,
            username: row.username as string,
            password: credentials.password ?? "",
            text: (row.content_text as string) ?? "",
            headless,
            ...(proxyConfig ? { proxy: proxyConfig } : {}),
          },
          { jobId: `sched-threads-${scheduledId}` },
        );

        // ジョブ完了を待たずに完了コールバックで更新（非同期）
        void watchJobCompletion(job.id!, scheduledId, postId, "threads");
      } else if (platform === "instagram") {
        const metadata = (row.metadata as Record<string, unknown>) ?? {};
        const imagePaths = (metadata.imagePaths as string[]) ?? [];

        if (imagePaths.length === 0) {
          await markFailed(scheduledId, postId, "Instagram post requires at least one image");
          continue;
        }

        const job = await instagramPostQueue.add(
          `scheduled-${scheduledId}`,
          {
            postId,
            username: row.username as string,
            password: credentials.password ?? "",
            caption: (row.content_text as string) ?? "",
            imagePaths,
            headless,
            ...(proxyConfig ? { proxy: proxyConfig } : {}),
          },
          { jobId: `sched-instagram-${scheduledId}` },
        );

        void watchJobCompletion(job.id!, scheduledId, postId, "instagram");
      } else {
        await markFailed(scheduledId, postId, `Unsupported platform: ${platform}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] Failed to enqueue post ${postId}:`, msg);
      // processing → pending に戻してリトライ
      await db.execute(sql`
        UPDATE scheduled_posts
        SET status = 'pending', error_message = ${msg}
        WHERE id = ${scheduledId}
      `);
    }
  }
}

/**
 * BullMQ ジョブの完了を監視して DB を更新する
 */
async function watchJobCompletion(
  jobId: string,
  scheduledId: string,
  postId: string,
  platform: "threads" | "instagram",
): Promise<void> {
  const queue = platform === "threads" ? threadsPostQueue : instagramPostQueue;
  const POLL_MS = 5_000;
  const TIMEOUT_MS = 10 * 60 * 1000; // 10分タイムアウト
  const start = Date.now();

  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    const job = await queue.getJob(jobId);
    if (!job) break;

    const state = await job.getState();

    if (state === "completed") {
      const db = getDb();
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`
        UPDATE scheduled_posts
        SET status = 'done', executed_at = NOW()
        WHERE id = ${scheduledId}
      `);
      await db.execute(sql`
        UPDATE posts
        SET status = 'posted', posted_at = NOW(), updated_at = NOW()
        WHERE id = ${postId}
      `);
      console.log(`[scheduler] Post ${postId} posted successfully`);
      return;
    }

    if (state === "failed") {
      const errMsg = job.failedReason ?? "Job failed";
      await markFailed(scheduledId, postId, errMsg);
      return;
    }
  }

  // タイムアウト
  await markFailed(scheduledId, postId, "Job timed out after 10 minutes");
}

async function markFailed(scheduledId: string, postId: string, reason: string): Promise<void> {
  const db = getDb();
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`
    UPDATE scheduled_posts
    SET status = 'failed', error_message = ${reason}
    WHERE id = ${scheduledId}
  `);
  await db.execute(sql`
    UPDATE posts SET status = 'failed', updated_at = NOW()
    WHERE id = ${postId}
  `);
  console.error(`[scheduler] Post ${postId} failed: ${reason}`);
}

/**
 * スケジューラーを起動する（1分ごとに実行）
 */
export function startScheduleExecutor(): NodeJS.Timeout {
  console.log("[scheduler] Schedule executor started (interval: 60s)");

  // 起動直後にも1回実行
  void executePendingPosts().catch((e) =>
    console.error("[scheduler] Error in initial check:", e),
  );

  return setInterval(() => {
    void executePendingPosts().catch((e) =>
      console.error("[scheduler] Error in scheduled check:", e),
    );
  }, CHECK_INTERVAL_MS);
}
