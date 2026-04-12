/**
 * monitor-accounts — 参考アカウントの定期監視ジョブ
 *
 * 登録済みの参考アカウントを再スクレイプし、
 * 投稿スコアの時系列スナップショットを蓄積する。
 * BullMQキュー経由で手動または定期実行。
 */
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import {
  pgTable, uuid, varchar, text, jsonb,
  integer, timestamp, boolean, real, index,
} from "drizzle-orm/pg-core";
import { ThreadsScraper, calcBuzzScore } from "../browser/threads-scraper.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
export const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// ── ローカルスキーマ定義 ──────────────────────────────────────────────────────
const referenceAccounts = pgTable("reference_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  genreId: uuid("genre_id").notNull(),
  username: varchar("username", { length: 100 }).notNull(),
  platform: varchar("platform", { length: 20 }).default("threads").notNull(),
  accountCreatedAt: varchar("account_created_at", { length: 50 }),
  accountAgeMonths: integer("account_age_months"),
  followersCount: integer("followers_count"),
  bio: text("bio"),
  postsCount: integer("posts_count"),
  lastProfileScrapedAt: timestamp("last_profile_scraped_at"),
});

const monitoredPosts = pgTable("monitored_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  referenceAccountId: uuid("reference_account_id").notNull(),
  genreId: uuid("genre_id").notNull(),
  platformPostId: varchar("platform_post_id", { length: 300 }),
  contentText: text("content_text").notNull(),
  imageUrls: jsonb("image_urls").$type<string[]>().default([]),
  hasImage: boolean("has_image").default(false).notNull(),
  likeCount: integer("like_count").default(0).notNull(),
  repostCount: integer("repost_count").default(0).notNull(),
  replyCount: integer("reply_count").default(0).notNull(),
  viewCount: integer("view_count").default(0).notNull(),
  buzzScore: real("buzz_score").default(0).notNull(),
  postedAt: timestamp("posted_at"),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSnapshotAt: timestamp("last_snapshot_at").defaultNow().notNull(),
}, (t) => [
  index("idx_monitored_posts_genre2").on(t.genreId),
  index("idx_monitored_posts_account2").on(t.referenceAccountId),
]);

const postScoreSnapshots = pgTable("post_score_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  monitoredPostId: uuid("monitored_post_id").notNull(),
  likeCount: integer("like_count").default(0).notNull(),
  repostCount: integer("repost_count").default(0).notNull(),
  replyCount: integer("reply_count").default(0).notNull(),
  viewCount: integer("view_count").default(0).notNull(),
  buzzScore: real("buzz_score").default(0).notNull(),
  snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
});

// ── 型定義 ───────────────────────────────────────────────────────────────────
export interface MonitorAccountsJobData {
  /** 特定のジャンルIDを指定（省略時は全ジャンル） */
  genreId?: string;
}

// ── ワーカー ─────────────────────────────────────────────────────────────────
export function createMonitorAccountsWorker() {
  const worker = new Worker<MonitorAccountsJobData>(
    "monitor-accounts",
    async (job: Job<MonitorAccountsJobData>) => {
      const { genreId } = job.data;
      const sqlClient = postgres(
        process.env.DATABASE_URL ?? "postgresql://sns_user:sns_password@localhost:5432/sns_automation",
      );
      const db = drizzle(sqlClient, {
        schema: { referenceAccounts, monitoredPosts, postScoreSnapshots },
      });

      try {
        // ── 対象アカウントを取得 ──
        const accounts = genreId
          ? await db.select().from(referenceAccounts).where(eq(referenceAccounts.genreId, genreId))
          : await db.select().from(referenceAccounts);

        const threadsAccounts = accounts.filter((a) => a.platform === "threads");
        console.log(`[monitor-accounts] 対象アカウント: ${threadsAccounts.length}件`);

        if (threadsAccounts.length === 0) return;

        const threadsUser = process.env.THREADS_USERNAME;
        const threadsPass = process.env.THREADS_PASSWORD;

        const scraper = new ThreadsScraper(
          { headless: true, username: threadsUser },
          (msg) => console.log(`[monitor-accounts] ${msg}`),
        );

        await scraper.init();

        try {
          if (threadsUser && threadsPass) {
            await scraper.login(threadsUser, threadsPass);
          }

          for (const account of threadsAccounts) {
            console.log(`[monitor-accounts] @${account.username} を監視中...`);

            // プロフィール更新（フォロワー数など）
            const profile = await scraper.scrapeAccountProfile(account.username);
            await db.update(referenceAccounts).set({
              accountCreatedAt: profile.accountCreatedAt ?? account.accountCreatedAt,
              accountAgeMonths: profile.accountAgeMonths ?? account.accountAgeMonths,
              followersCount: profile.followersCount ?? account.followersCount,
              bio: profile.bio ?? account.bio,
              postsCount: profile.postsCount ?? account.postsCount,
              lastProfileScrapedAt: new Date(),
            }).where(eq(referenceAccounts.id, account.id));

            // 投稿収集（最新30件）
            const posts = await scraper.scrapeAccountPosts(account.username, 30);
            let newPosts = 0;
            let updatedPosts = 0;

            for (const p of posts) {
              const { buzzScore } = calcBuzzScore({
                ...p,
                authorFollowers: profile.followersCount,
              });

              if (p.platformPostId) {
                // 既存投稿を検索
                const existing = await db
                  .select({ id: monitoredPosts.id })
                  .from(monitoredPosts)
                  .where(
                    and(
                      eq(monitoredPosts.referenceAccountId, account.id),
                      eq(monitoredPosts.platformPostId, p.platformPostId),
                    ),
                  )
                  .limit(1);

                if (existing.length > 0) {
                  // スコア更新 + スナップショット
                  await db.update(monitoredPosts).set({
                    likeCount: p.likeCount,
                    repostCount: p.repostCount,
                    replyCount: p.replyCount,
                    viewCount: p.viewCount,
                    buzzScore,
                    lastSnapshotAt: new Date(),
                  }).where(eq(monitoredPosts.id, existing[0].id));

                  await db.insert(postScoreSnapshots).values({
                    monitoredPostId: existing[0].id,
                    likeCount: p.likeCount,
                    repostCount: p.repostCount,
                    replyCount: p.replyCount,
                    viewCount: p.viewCount,
                    buzzScore,
                  });
                  updatedPosts++;
                } else {
                  // 新規投稿
                  const [inserted] = await db.insert(monitoredPosts).values({
                    referenceAccountId: account.id,
                    genreId: account.genreId,
                    platformPostId: p.platformPostId,
                    contentText: p.contentText,
                    imageUrls: p.imageUrls,
                    hasImage: p.hasImage,
                    likeCount: p.likeCount,
                    repostCount: p.repostCount,
                    replyCount: p.replyCount,
                    viewCount: p.viewCount,
                    buzzScore,
                    postedAt: p.postedAt,
                  }).returning({ id: monitoredPosts.id });

                  await db.insert(postScoreSnapshots).values({
                    monitoredPostId: inserted.id,
                    likeCount: p.likeCount,
                    repostCount: p.repostCount,
                    replyCount: p.replyCount,
                    viewCount: p.viewCount,
                    buzzScore,
                  });
                  newPosts++;
                }
              }
            }

            console.log(`[monitor-accounts] @${account.username}: 新規${newPosts}件 更新${updatedPosts}件`);
          }
        } finally {
          await scraper.close();
        }

        console.log(`[monitor-accounts] 完了`);
      } finally {
        await sqlClient.end();
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[monitor-accounts] job ${job?.id} failed:`, err.message);
  });

  return worker;
}
