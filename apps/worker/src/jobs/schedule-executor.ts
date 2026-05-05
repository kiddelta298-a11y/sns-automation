import { lte, eq, and, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { threadsPostQueue } from "./post-to-threads.js";
import { instagramPostQueue } from "./post-to-instagram.js";
import { stripExternalLinks } from "../browser/threads.js";

const CHECK_INTERVAL_MS = 60_000; // 1分ごとに確認
const MAX_RETRY = 3;

/**
 * pending かつ scheduledAt を過ぎた予約投稿を取得してキューに投入する
 */
async function executePendingPosts(): Promise<void> {
  const db = getDb();

  const rows = await db.execute(sql`
    SELECT
      sp.id        AS scheduled_id,
      sp.post_id,
      sp.retry_count,
      sp.scheduled_at,
      p.platform,
      p.content_text,
      p.link_url,
      p.metadata,
      a.id         AS account_id,
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

    // processing に更新してキューへ投入（進捗リセット）
    await db.execute(sql`
      UPDATE scheduled_posts
      SET status = 'processing', retry_count = retry_count + 1,
          started_at = NOW(), current_stage = 'login', progress_pct = 0
      WHERE id = ${scheduledId}
    `);

    const credentials = row.credentials as Record<string, unknown>;
    const storageState = credentials.storageState as Record<string, unknown> | undefined;
    const proxyConfig = row.proxy_config as { server: string; username?: string; password?: string } | null;
    const headless = process.env.HEADLESS !== "false";
    const accountId = row.account_id as string;

    try {
      if (platform === "threads") {
        const sanitizedText = stripExternalLinks((row.content_text as string) ?? "");
        if (!sanitizedText) {
          await markFailed(scheduledId, postId, "Post text is empty after stripping external links");
          continue;
        }

        // metadata.imagePaths があれば添付画像として渡す（画像付き自動投稿用）
        const metadataT = (row.metadata as Record<string, unknown>) ?? {};
        const imagePathsT = Array.isArray(metadataT.imagePaths)
          ? (metadataT.imagePaths as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 0)
          : [];

        const job = await threadsPostQueue.add(
          `scheduled-${scheduledId}`,
          {
            postId,
            accountId,
            scheduledId,
            username: row.username as string,
            password: (credentials.password as string) ?? "",
            ...(storageState ? { storageState } : {}),
            text: sanitizedText,
            ...(imagePathsT.length > 0 ? { imagePaths: imagePathsT } : {}),
            headless,
            ...(proxyConfig ? { proxy: proxyConfig } : {}),
          },
          { jobId: `sched-threads-${scheduledId}` },
        );

        // post_history に pending レコード作成
        await db.execute(sql`
          INSERT INTO post_history (id, job_id, platform, content, scheduled_at, status, created_at, updated_at)
          VALUES (gen_random_uuid(), ${job.id!}, 'threads', ${sanitizedText}, ${row.scheduled_at as string}, 'pending', NOW(), NOW())
        `);

        // ジョブ完了を待たずに完了コールバックで更新（非同期・エラーログ付き）
        watchJobCompletion(job.id!, scheduledId, postId, "threads").catch((e) =>
          console.error(`[scheduler] watchJobCompletion error for ${scheduledId}:`, e),
        );
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

        // post_history に pending レコード作成
        await db.execute(sql`
          INSERT INTO post_history (id, job_id, platform, content, scheduled_at, status, created_at, updated_at)
          VALUES (gen_random_uuid(), ${job.id!}, 'instagram', ${(row.content_text as string) ?? ""}, ${row.scheduled_at as string}, 'pending', NOW(), NOW())
        `);

        watchJobCompletion(job.id!, scheduledId, postId, "instagram").catch((e) =>
          console.error(`[scheduler] watchJobCompletion error for ${scheduledId}:`, e),
        );
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
 * 責務: status/progress のみ更新（executed_at/platform_post_id は post-to-threads.ts 側で記録）
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

    let job;
    try {
      job = await queue.getJob(jobId);
    } catch (e) {
      console.warn(`[scheduler] getJob error for ${jobId}:`, e);
      continue;
    }

    if (!job) {
      // ジョブが Redis から削除済み（removeOnComplete で早期削除等）
      // posts テーブルの status で成否を判断
      const db = getDb();
      const rows = await db.execute(sql`SELECT status FROM posts WHERE id = ${postId}`);
      const postStatus = (rows[0]?.status as string) ?? "";
      if (postStatus === "posted") {
        // post-to-threads.ts 側で既に成功更新済み
        await db.execute(sql`
          UPDATE scheduled_posts
          SET status = 'done', progress_pct = 100, current_stage = 'done'
          WHERE id = ${scheduledId} AND status != 'done'
        `);
        console.log(`[scheduler] Job ${jobId} already completed (job removed from queue)`);
      } else {
        console.warn(`[scheduler] Job ${jobId} not found in queue, treating as timed out`);
        await markFailed(scheduledId, postId, "Job not found in queue (possibly timed out)");
      }
      return;
    }

    let state: string;
    try {
      state = await job.getState();
    } catch (e) {
      console.warn(`[scheduler] getState error for ${jobId}:`, e);
      continue;
    }

    if (state === "completed") {
      try {
        const db = getDb();
        await db.execute(sql`
          UPDATE scheduled_posts
          SET status = 'done', progress_pct = 100, current_stage = 'done'
          WHERE id = ${scheduledId}
        `);
        await db.execute(sql`
          UPDATE posts
          SET status = 'posted', posted_at = NOW(), updated_at = NOW()
          WHERE id = ${postId}
        `);
        console.log(`[scheduler] Post ${postId} posted successfully`);
      } catch (e) {
        console.error(`[scheduler] DB update failed after job completion for ${scheduledId}:`, e);
        throw e;
      }
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
