import { Worker, Queue, type Job } from "bullmq";
import { createWriteStream, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import {
  InstagramBrowser,
  type InstagramPostResult,
} from "../browser/instagram.js";
import { connection } from "./post-to-threads.js";

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
        headless,
        proxy,
      } = job.data;

      console.log(
        `[job:${job.id}] Processing Instagram post ${postId} for @${username}`,
      );
      await job.updateProgress(10);

      const browser = new InstagramBrowser(
        { username, password },
        { headless: headless ?? true, proxy },
      );

      const { resolved: resolvedPaths, tmpFiles } = await resolveImagePaths(imagePaths);

      try {
        // ブラウザ初期化
        await browser.init();
        await job.updateProgress(30);

        // ログイン
        await browser.login();
        await job.updateProgress(50);

        // 投稿
        const result = await browser.post({ caption, imagePaths: resolvedPaths });
        await job.updateProgress(90);

        if (!result.success) {
          throw new Error(result.error ?? "Instagram post failed");
        }

        console.log(
          `[job:${job.id}] Instagram post ${postId} completed successfully`,
        );
        await job.updateProgress(100);

        return { postId, result };
      } finally {
        await browser.close();
        // 一時ファイルを削除
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
