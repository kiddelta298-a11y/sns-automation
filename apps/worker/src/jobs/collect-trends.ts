import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  pgTable, uuid, varchar, text, timestamp, integer, boolean, real, index,
} from "drizzle-orm/pg-core";
import { eq, sql } from "drizzle-orm";
import { ThreadsScraper, calcBuzzScore, classifyPostFormat } from "../browser/threads-scraper.js";
import { InstagramScraper } from "../browser/instagram-scraper.js";
import { collectImages } from "./image-collector.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// ============================================================
// 必要最小限のスキーマ定義（APIのschema.tsと同構造）
// ============================================================
const collectionJobs = pgTable("collection_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  industryId: uuid("industry_id"),
  keywordSetId: uuid("keyword_set_id"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  targetCount: integer("target_count").default(500).notNull(),
  collectedCount: integer("collected_count").default(0).notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const collectedImages = pgTable(
  "collected_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id").notNull(),
    keywordSetId: uuid("keyword_set_id"),
    keyword: varchar("keyword", { length: 200 }),
    authorUsername: varchar("author_username", { length: 100 }),
    contentText: text("content_text"),
    imageUrl: text("image_url").notNull(),
    localPath: varchar("local_path", { length: 500 }),
    likeCount: integer("like_count").default(0),
    buzzScore: real("buzz_score").default(0),
    analysisText: text("analysis_text"),
    analyzedAt: timestamp("analyzed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_ci_job").on(t.jobId)],
);

const trendPosts = pgTable(
  "trend_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id").notNull(),
    industryId: uuid("industry_id"),
    keywordSetId: uuid("keyword_set_id"),
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
    platformPostId: varchar("platform_post_id", { length: 300 }),
    postedAt: timestamp("posted_at"),
    collectedAt: timestamp("collected_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_tp_job").on(t.jobId),
  ],
);

// ============================================================
// ジョブデータ型
// ============================================================
export interface CollectTrendsJobData {
  jobId: string;
  industryId: string | null;
  keywordSetId?: string | null;
  industrySlug: string;
  keywords: string[];
  /** このうち何個以上のキーワードを含む投稿のみ残すか（デフォルト1=制限なし） */
  minKeywordMatch?: number;
  targetCount: number;
  platforms?: ("threads" | "instagram")[];
  instagramCredentials?: { username: string; password: string };
  /** 収集対象期間（日数）。0 または未指定で期間制限なし */
  periodDays?: number;
  /** バズ画像を収集してGemini Visionで分析するか */
  collectImages?: boolean;
}

type TrendPostInsert = typeof trendPosts.$inferInsert;

// ============================================================
// トレンド収集ワーカー
// ============================================================
export function createCollectTrendsWorker() {
  const worker = new Worker<CollectTrendsJobData>(
    "collect-trends",
    async (job: Job<CollectTrendsJobData>) => {
      const {
        jobId,
        industryId,
        keywordSetId,
        keywords,
        minKeywordMatch = 1,
        targetCount,
        platforms = ["threads"],
        instagramCredentials,
        periodDays = 0,
        collectImages: shouldCollectImages = false,
      } = job.data;

      const sqlClient = postgres(process.env.DATABASE_URL ?? "");
      const db = drizzle(sqlClient, { schema: { collectionJobs, trendPosts, collectedImages } });

      // 進捗メッセージをDBに保存してSSEで配信
      const updateProgress = async (message: string, count?: number) => {
        console.log(`[collect-trends] ${message}`);
        await db.update(collectionJobs)
          .set({
            ...(count !== undefined ? { collectedCount: count } : {}),
            errorMessage: null, // 進捗メッセージとして流用（running中はエラーではない）
          })
          .where(eq(collectionJobs.id, jobId))
          .catch(() => {}); // 進捗更新失敗は無視
        // BullMQ job progress（数値）
        await job.updateProgress(count ?? allPosts.length).catch(() => {});
      };

      // currentStatus を collection_jobs の metadata 的なカラムに格納
      // errorMessage カラムを running 中は「進捗メッセージ」として流用
      const setStatusMsg = async (msg: string) => {
        await db.update(collectionJobs)
          .set({ errorMessage: msg })
          .where(eq(collectionJobs.id, jobId))
          .catch(() => {});
      };

      await db.update(collectionJobs)
        .set({ status: "running", startedAt: new Date(), errorMessage: "初期化中..." })
        .where(eq(collectionJobs.id, jobId));

      const allPosts: TrendPostInsert[] = [];
      // 画像収集用：imageUrls を持つ投稿を別途保持
      const imageQueue: {
        keyword: string;
        authorUsername: string | null;
        contentText: string;
        imageUrls: string[];
        likeCount: number;
        buzzScore: number;
      }[] = [];
      let currentKeyword = "";

      /**
       * 混在フィルタリング：
       * minKeywordMatch >= 2 の場合、投稿本文に keywords のうち N 個以上含まれるもののみ通す
       */
      const passesKeywordFilter = (text: string): boolean => {
        if (minKeywordMatch <= 1) return true;
        const lower = text.toLowerCase();
        const matchCount = keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
        return matchCount >= minKeywordMatch;
      };

      /**
       * 期間フィルタリング：
       * periodDays > 0 の場合、postedAt が periodDays 日以内の投稿のみ通す
       */
      const sinceDate = periodDays > 0 ? new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000) : null;
      const passesDateFilter = (postedAt: Date | null): boolean => {
        if (!sinceDate) return true;
        if (!postedAt) return true; // 日付不明は通す
        return postedAt >= sinceDate;
      };

      const pushPost = (p: import("../browser/threads-scraper.js").ScrapedPost) => {
        if (!p.contentText.trim()) return;
        if (!passesKeywordFilter(p.contentText)) return;
        if (!passesDateFilter(p.postedAt)) return;
        if (allPosts.some(ap => (ap.contentText as string).slice(0, 50) === p.contentText.slice(0, 50))) return;
        const { buzzScore, engagementRate } = calcBuzzScore(p);
        allPosts.push({
          jobId,
          industryId: industryId ?? undefined,
          keywordSetId: keywordSetId ?? undefined,
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
          platformPostId: p.platformPostId ?? null,
          postedAt: p.postedAt,
        });
        // 画像付き投稿を画像キューに追加
        if (shouldCollectImages && p.imageUrls.length > 0) {
          imageQueue.push({
            keyword: currentKeyword,
            authorUsername: p.authorUsername,
            contentText: p.contentText,
            imageUrls: p.imageUrls,
            likeCount: p.likeCount,
            buzzScore,
          });
        }
      };

      try {
        // ============================================================
        // Threads 収集
        // ============================================================
        if (platforms.includes("threads")) {
          // Threads ログイン（env から認証情報を取得）
          const threadsUser = process.env.THREADS_USERNAME;
          const threadsPass = process.env.THREADS_PASSWORD;

          const scraper = new ThreadsScraper(
            { headless: true, username: threadsUser },
            async (msg) => {
              console.log(`[scraper] ${msg}`);
              await setStatusMsg(msg);
            },
          );
          try {
            await scraper.init();
            if (threadsUser && threadsPass) {
              await setStatusMsg("Threadsにログイン中...");
              await scraper.login(threadsUser, threadsPass);
            } else {
              await setStatusMsg("ログイン情報なし（未ログイン収集）");
            }

            // キーワードセットモードでは全枠をキーワード検索に使う（フィード収集はしない）
            const isKeywordSetMode = !!keywordSetId;
            const keywordRatio = isKeywordSetMode ? 1.0 : 0.6;
            const perKeyword = Math.ceil(targetCount * keywordRatio / Math.max(keywords.length, 1));
            const feedTarget = isKeywordSetMode ? 0 : Math.ceil(targetCount * 0.4);

            console.log(`[collect-trends:threads] jobId=${jobId} keywords=${keywords.length} minMatch=${minKeywordMatch}`);

            for (const [kwIdx, keyword] of keywords.entries()) {
              currentKeyword = keyword;
              await setStatusMsg(`(${kwIdx + 1}/${keywords.length}) 「${keyword}」を収集中...`);
              try {
                const scraped = await scraper.scrapeByKeyword(keyword, perKeyword);
                scraped.forEach(pushPost);
                // キーワードごとに収集数をリアルタイム更新（SSEで配信される）
                await db.update(collectionJobs)
                  .set({ collectedCount: allPosts.length })
                  .where(eq(collectionJobs.id, jobId));
                await setStatusMsg(`(${kwIdx + 1}/${keywords.length}) 「${keyword}」完了 — 累計 ${allPosts.length}件`);
                console.log(`[collect-trends:threads] keyword="${keyword}" scraped=${scraped.length} passed=${allPosts.length}`);
              } catch (err) {
                console.warn(`[collect-trends:threads] keyword="${keyword}" error:`, err);
              }
            }

            if (feedTarget > 0) {
              try {
                await setStatusMsg("おすすめフィードを収集中...");
                const feedPosts = await scraper.scrapeForYouFeed(feedTarget);
                feedPosts.forEach(pushPost);
                await db.update(collectionJobs).set({ collectedCount: allPosts.length }).where(eq(collectionJobs.id, jobId));
                console.log(`[collect-trends:threads] forYouFeed scraped=${feedPosts.length}`);
              } catch (err) {
                console.warn("[collect-trends:threads] forYouFeed error:", err);
              }
            }
          } finally {
            await scraper.close();
          }

          await db.update(collectionJobs)
            .set({ collectedCount: allPosts.length })
            .where(eq(collectionJobs.id, jobId));
        }

        // ============================================================
        // Instagram 収集
        // ============================================================
        if (platforms.includes("instagram") && instagramCredentials) {
          const igScraper = new InstagramScraper({ headless: true });
          try {
            await igScraper.init();
            const loggedIn = await igScraper.login(
              instagramCredentials.username,
              instagramCredentials.password,
            );

            if (!loggedIn) {
              console.warn("[collect-trends:instagram] login failed, skipping Instagram collection");
            } else {
              const igTarget = Math.ceil(targetCount * 0.5);
              const perHashtag = Math.ceil(igTarget * 0.6 / Math.max(keywords.length, 1));
              const exploreTarget = Math.ceil(igTarget * 0.4);

              console.log(`[collect-trends:instagram] jobId=${jobId} hashtags=${keywords.length}`);

              for (const keyword of keywords) {
                try {
                  const scraped = await igScraper.scrapeByHashtag(keyword, perHashtag);
                  scraped.forEach(pushPost);
                  console.log(`[collect-trends:instagram] hashtag="${keyword}" scraped=${scraped.length}`);
                } catch (err) {
                  console.warn(`[collect-trends:instagram] hashtag="${keyword}" error:`, err);
                }
              }

              try {
                const explorePosts = await igScraper.scrapeExploreFeed(exploreTarget);
                explorePosts.forEach(pushPost);
                console.log(`[collect-trends:instagram] explore scraped=${explorePosts.length}`);
              } catch (err) {
                console.warn("[collect-trends:instagram] explore error:", err);
              }

              await db.update(collectionJobs)
                .set({ collectedCount: allPosts.length })
                .where(eq(collectionJobs.id, jobId));
            }
          } finally {
            await igScraper.close();
          }
        }

        // ── 画像収集・分析（非同期でバックグラウンド実行） ────────────────────
        if (shouldCollectImages && imageQueue.length > 0) {
          console.log(`[collect-trends] Starting image collection: ${imageQueue.length} posts with images`);
          // バズスコア上位から最大30枚
          const topImagePosts = imageQueue
            .sort((a, b) => b.buzzScore - a.buzzScore)
            .slice(0, 30);

          collectImages(
            topImagePosts.map(p => ({ ...p, jobId, keywordSetId: keywordSetId ?? null })),
            30,
          ).then(async (records) => {
            if (records.length === 0) return;
            const BATCH = 50;
            for (let i = 0; i < records.length; i += BATCH) {
              await db.insert(collectedImages).values(
                records.slice(i, i + BATCH).map(r => ({
                  jobId: r.jobId,
                  keywordSetId: r.keywordSetId,
                  keyword: r.keyword,
                  authorUsername: r.authorUsername,
                  contentText: r.contentText,
                  imageUrl: r.imageUrl,
                  localPath: r.localPath,
                  likeCount: r.likeCount,
                  buzzScore: r.buzzScore,
                  analysisText: r.analysisText || null,
                  analyzedAt: r.analysisText ? new Date() : null,
                })),
              ).catch(err => console.warn("[collect-trends] image insert error:", err));
            }
            console.log(`[collect-trends] Image records saved: ${records.length}`);
          }).catch(err => console.warn("[collect-trends] image collection error:", err));
        }

        // 重複除去・バルクinsert
        await setStatusMsg("DB に保存中...");
        const unique = deduplicatePosts(allPosts);
        const toInsert = unique.slice(0, targetCount * 2);

        if (toInsert.length > 0) {
          const BATCH = 500;
          for (let i = 0; i < toInsert.length; i += BATCH) {
            await db.insert(trendPosts).values(toInsert.slice(i, i + BATCH));
          }
        }

        await db.update(collectionJobs)
          .set({ status: "completed", collectedCount: toInsert.length, completedAt: new Date(), errorMessage: null })
          .where(eq(collectionJobs.id, jobId));

        console.log(`[collect-trends] jobId=${jobId} completed. total=${toInsert.length}`);

      } catch (err) {
        await db.update(collectionJobs)
          .set({ status: "failed", errorMessage: String(err), completedAt: new Date() })
          .where(eq(collectionJobs.id, jobId));
        throw err;
      } finally {
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
