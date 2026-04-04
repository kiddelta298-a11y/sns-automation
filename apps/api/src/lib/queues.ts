import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const connectionOpts = { host: new URL(REDIS_URL.replace("redis://","http://")).hostname, port: parseInt(new URL(REDIS_URL.replace("redis://","http://")).port || "6379") };

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
