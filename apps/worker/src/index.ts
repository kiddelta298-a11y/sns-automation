import { createServer } from "node:http";
import { createThreadsPostWorker } from "./jobs/post-to-threads.js";
import { createInstagramPostWorker } from "./jobs/post-to-instagram.js";
import { createCollectTrendsWorker } from "./jobs/collect-trends.js";

async function main(): Promise<void> {
  console.log("[worker] Starting SNS Automation Worker...");

  // Render web service requires an HTTP server for health checks
  const port = Number(process.env.PORT ?? 3001);
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", worker: "running" }));
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

  // トレンド収集ワーカーを起動
  const collectTrendsWorker = createCollectTrendsWorker();
  console.log("[worker] Collect trends worker started");

  // グレースフルシャットダウン
  const shutdown = async (signal: string) => {
    console.log(`[worker] Received ${signal}, shutting down...`);
    await Promise.all([
      threadsWorker.close(),
      instagramWorker.close(),
      collectTrendsWorker.close(),
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
