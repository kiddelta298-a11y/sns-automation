import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  pgTable, uuid, varchar, text, timestamp, integer, boolean, real, index,
} from "drizzle-orm/pg-core";
import { eq, sql } from "drizzle-orm";
import { ThreadsScraper, calcBuzzScore, classifyPostFormat } from "../browser/threads-scraper.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// ============================================================
// 必要最小限のスキーマ定義（APIのschema.tsと同構造）
// ============================================================
const collectionJobs = pgTable("collection_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  industryId: uuid("industry_id").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  targetCount: integer("target_count").default(500).notNull(),
  collectedCount: integer("collected_count").default(0).notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const trendPosts = pgTable(
  "trend_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id").notNull(),
    industryId: uuid("industry_id").notNull(),
    authorUsername: varchar("author_username", { length: 100 }),
    authorFollowers: integer("author_followers"),
    contentText: text("content_text").notNull(),
    hasImage: boolean("has_image").default(false).notNull(),
    likeCount: integer("like_count").default(0).notNull(),
    repostCount: integer("repost_count").default(0).notNull(),
    replyCount: integer("reply_count").default(0).notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    buzzScore: real("buzz_score").default(0).notNull(),
    engagementRate: real("engagement_rate").default(0).notNull(),
    postFormat: varchar("post_format", { length: 30 }),
    charCount: integer("char_count").default(0).notNull(),
    postedAt: timestamp("posted_at"),
    collectedAt: timestamp("collected_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_tp_job").on(t.jobId),
    index("idx_tp_industry_buzz").on(t.industryId, t.buzzScore),
  ],
);

// ============================================================
// ジョブデータ型
// ============================================================
export interface CollectTrendsJobData {
  jobId: string;
  industryId: string;
  industrySlug: string;
  keywords: string[];
  targetCount: number;
}

type TrendPostInsert = typeof trendPosts.$inferInsert;

// ============================================================
// トレンド収集ワーカー
// ============================================================
export function createCollectTrendsWorker() {
  const worker = new Worker<CollectTrendsJobData>(
    "collect-trends",
    async (job: Job<CollectTrendsJobData>) => {
      const { jobId, industryId, keywords, targetCount } = job.data;

      const sqlClient = postgres(process.env.DATABASE_URL ?? "");
      const db = drizzle(sqlClient, { schema: { collectionJobs, trendPosts } });

      await db.update(collectionJobs)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(collectionJobs.id, jobId));

      const scraper = new ThreadsScraper({ headless: true });
      const allPosts: TrendPostInsert[] = [];

      try {
        await scraper.init();

        const perKeyword = Math.ceil(targetCount * 0.6 / Math.max(keywords.length, 1));
        const feedTarget = Math.ceil(targetCount * 0.4);

        console.log(`[collect-trends] jobId=${jobId} keywords=${keywords.length} perKeyword=${perKeyword}`);

        // キーワード別収集
        for (const keyword of keywords) {
          try {
            const scraped = await scraper.scrapeByKeyword(keyword, perKeyword);
            console.log(`[collect-trends] keyword="${keyword}" scraped=${scraped.length}`);

            for (const p of scraped) {
              if (!p.contentText.trim()) continue;
              const { buzzScore, engagementRate } = calcBuzzScore(p);
              allPosts.push({
                jobId,
                industryId,
                authorUsername: p.authorUsername,
                authorFollowers: p.authorFollowers,
                contentText: p.contentText,
                hasImage: p.hasImage,
                likeCount: p.likeCount,
                repostCount: p.repostCount,
                replyCount: p.replyCount,
                viewCount: p.viewCount,
                buzzScore,
                engagementRate,
                postFormat: classifyPostFormat(p.contentText),
                charCount: p.contentText.length,
                postedAt: p.postedAt,
              });
            }

            await db.update(collectionJobs)
              .set({ collectedCount: allPosts.length })
              .where(eq(collectionJobs.id, jobId));

          } catch (err) {
            console.warn(`[collect-trends] keyword="${keyword}" error:`, err);
          }
        }

        // おすすめフィード収集
        try {
          const feedPosts = await scraper.scrapeForYouFeed(feedTarget);
          console.log(`[collect-trends] forYouFeed scraped=${feedPosts.length}`);

          for (const p of feedPosts) {
            if (!p.contentText.trim()) continue;
            if (allPosts.some(ap => ap.contentText === p.contentText)) continue;

            const { buzzScore, engagementRate } = calcBuzzScore(p);
            allPosts.push({
              jobId,
              industryId,
              authorUsername: p.authorUsername,
              authorFollowers: p.authorFollowers,
              contentText: p.contentText,
              hasImage: p.hasImage,
              likeCount: p.likeCount,
              repostCount: p.repostCount,
              replyCount: p.replyCount,
              viewCount: p.viewCount,
              buzzScore,
              engagementRate,
              postFormat: classifyPostFormat(p.contentText),
              charCount: p.contentText.length,
              postedAt: p.postedAt,
            });
          }
        } catch (err) {
          console.warn("[collect-trends] forYouFeed error:", err);
        }

        // 重複除去・バルクinsert
        const unique = deduplicatePosts(allPosts);
        const toInsert = unique.slice(0, targetCount * 2);

        if (toInsert.length > 0) {
          const BATCH = 500;
          for (let i = 0; i < toInsert.length; i += BATCH) {
            await db.insert(trendPosts).values(toInsert.slice(i, i + BATCH));
          }
        }

        await db.update(collectionJobs)
          .set({ status: "completed", collectedCount: toInsert.length, completedAt: new Date() })
          .where(eq(collectionJobs.id, jobId));

        console.log(`[collect-trends] jobId=${jobId} completed. total=${toInsert.length}`);

      } catch (err) {
        await db.update(collectionJobs)
          .set({ status: "failed", errorMessage: String(err), completedAt: new Date() })
          .where(eq(collectionJobs.id, jobId));
        throw err;
      } finally {
        await scraper.close();
        await sqlClient.end();
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[collect-trends] job ${job?.id} failed:`, err.message);
  });

  return worker;
}

function deduplicatePosts(posts: TrendPostInsert[]): TrendPostInsert[] {
  const seen = new Set<string>();
  return posts.filter(p => {
    const key = (p.contentText as string).trim().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
