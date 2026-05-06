import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Upstash の rediss:// (TLS) と認証付きURLを正しく扱うため、URL文字列で IORedis インスタンスを生成して共有する。
// 旧実装は new URL(...).hostname/port だけ取り出していたため、TLS/パスワード/dbが落ち、Upstash に接続できず
// `monitorAccountsQueue.add` などの BullMQ操作がレスポンスを返さずハングしていた。
const connectionOpts = new IORedis(REDIS_URL, { maxRetriesPerRequest: null }) as any;

// トレンド収集ジョブキュー
export const collectTrendsQueue = new Queue("collect-trends", {
  connection: connectionOpts,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

// トレンド分析ジョブキュー（Claude）
export const analyzeTrendsQueue = new Queue("analyze-trends", {
  connection: connectionOpts,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

// 投稿生成ジョブキュー（Claude）
export const generateDraftsQueue = new Queue("generate-drafts", {
  connection: connectionOpts,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

// ジャンル別リサーチ分析ジョブキュー
export const analyzeGenreQueue = new Queue("analyze-genre", {
  connection: connectionOpts,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

// 参考アカウント定期監視ジョブキュー
export const monitorAccountsQueue = new Queue("monitor-accounts", {
  connection: connectionOpts,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

// Instagram ストーリー投稿ジョブキュー
export const instagramStoryQueue = new Queue("post-to-instagram-story", {
  connection: connectionOpts,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

// Instagram フィード投稿ジョブキュー（worker側 QUEUE_NAME と一致させる）
export const instagramPostQueue = new Queue("post-to-instagram", {
  connection: connectionOpts,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});
