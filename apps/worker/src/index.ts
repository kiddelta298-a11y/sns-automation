import { createServer } from "node:http";
import { createThreadsPostWorker } from "./jobs/post-to-threads.js";
import { createInstagramPostWorker, createInstagramStoryWorker } from "./jobs/post-to-instagram.js";
import { createXPostWorker } from "./jobs/post-to-x.js";
import { createCollectTrendsWorker } from "./jobs/collect-trends.js";
import { startScheduleExecutor } from "./jobs/schedule-executor.js";
import { createAnalyzeGenreWorker } from "./jobs/analyze-genre.js";
import { createMonitorAccountsWorker } from "./jobs/monitor-accounts.js";

async function main(): Promise<void> {
  console.log("[worker] Starting SNS Automation Worker...");

  // Render web service requires an HTTP server for health checks
  const port = Number(process.env.PORT ?? 3001);
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", worker: "running" }));
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[worker] Port ${port} already in use — health server skipped (local dev)`);
    } else {
      console.error("[worker] Health server error:", err);
    }
  });
  server.listen(port, () => {
    console.log(`[worker] Health server listening on port ${port}`);
  });

  // Threads 投稿ワーカーを起動
  const threadsWorker = createThreadsPostWorker();
  console.log("[worker] Threads post worker started");

  // Instagram 投稿ワーカーを起動
  const instagramWorker = createInstagramPostWorker();
  console.log("[worker] Instagram post worker started");

  // Instagram ストーリーワーカーを起動
  const instagramStoryWorker = createInstagramStoryWorker();
  console.log("[worker] Instagram story worker started");

  // X (旧Twitter) 投稿ワーカーを起動
  const xWorker = createXPostWorker();
  console.log("[worker] X post worker started");

  // トレンド収集ワーカーを起動
  const collectTrendsWorker = createCollectTrendsWorker();
  console.log("[worker] Collect trends worker started");

  // 予約投稿スケジューラーを起動
  const schedulerTimer = startScheduleExecutor();
  console.log("[worker] Schedule executor started");

  // ジャンル別リサーチ分析ワーカーを起動
  const analyzeGenreWorker = createAnalyzeGenreWorker();
  console.log("[worker] Analyze genre worker started");

  // 参考アカウント定期監視ワーカーを起動
  const monitorAccountsWorker = createMonitorAccountsWorker();
  console.log("[worker] Monitor accounts worker started");

  // グレースフルシャットダウン
  const shutdown = async (signal: string) => {
    console.log(`[worker] Received ${signal}, shutting down...`);
    clearInterval(schedulerTimer);
    await Promise.all([
      threadsWorker.close(),
      instagramWorker.close(),
      instagramStoryWorker.close(),
      xWorker.close(),
      collectTrendsWorker.close(),
      analyzeGenreWorker.close(),
      monitorAccountsWorker.close(),
    ]);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log("[worker] Worker is running. Waiting for jobs...");
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
