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
import { calcBuzzScore, type ScrapedPost } from "../browser/threads-scraper.js";
import { createThreadsScraper } from "../browser/threads-scraper-factory.js";
import { downloadPostImages } from "./download-images.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
export const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null }) as any;

// ── ローカルスキーマ定義 ──────────────────────────────────────────────────────
// ジャンル（グループ）テーブル — buzzThresholds を読むため
const adultGenres = pgTable("adult_genres", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  buzzThresholds: jsonb("buzz_thresholds").$type<{
    minLikes: number; minViews: number; minReplies: number; minReposts: number;
  }>(),
});

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
  localImagePaths: jsonb("local_image_paths").$type<string[]>().default([]),
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
export interface MonitorFilter {
  minLikes?: number;
  maxLikes?: number;
  minReplies?: number;
  maxReplies?: number;
  minViews?: number;
  maxViews?: number;
  minReposts?: number;
  maxReposts?: number;
  applyBuzzThreshold?: boolean;
}

export interface MonitorAccountsJobData {
  /** 特定のジャンルIDを指定（省略時は全ジャンル） */
  genreId?: string;
  /** 1アカウントあたりの「フィルター合致」目標件数（デフォルト 30） */
  limit?: number;
  /** 投稿間の待機時間レンジ [min, max] ms（デフォルト [6000, 14000]） */
  postDelayMs?: [number, number];
  /** フィルター条件（指定時はこれに合致した投稿が limit 件になるまで抽出を続ける） */
  filter?: MonitorFilter;
}

export interface MonitorAccountsProgress {
  phase: "init" | "scraping-profile" | "scraping-posts" | "done";
  totalAccounts: number;
  accountIndex: number;
  currentAccount: string | null;
  /** 合致目標件数（= limit） */
  targetMatches: number;
  /** 現在までに合致した投稿数（現在のアカウント） */
  matchedCount: number;
  /** 現在までに詳細ページ訪問した件数（現在のアカウント） */
  processedCount: number;
  message: string;
  newPosts: number;
  updatedPosts: number;
}

// ── ワーカー ─────────────────────────────────────────────────────────────────
export function createMonitorAccountsWorker() {
  const worker = new Worker<MonitorAccountsJobData>(
    "monitor-accounts",
    async (job: Job<MonitorAccountsJobData>) => {
      const { genreId } = job.data;
      const limit = job.data.limit && job.data.limit > 0 ? Math.min(job.data.limit, 200) : 30;
      const postDelayMs = job.data.postDelayMs ?? [6_000, 14_000];
      const sqlClient = postgres(
        process.env.DATABASE_URL ?? "postgresql://sns_user:sns_password@localhost:5432/sns_automation",
      );
      const db = drizzle(sqlClient, {
        schema: { adultGenres, referenceAccounts, monitoredPosts, postScoreSnapshots },
      });

      // 進捗状態（BullMQ job.progressへ流す）
      const progress: MonitorAccountsProgress = {
        phase: "init",
        totalAccounts: 0,
        accountIndex: 0,
        currentAccount: null,
        targetMatches: limit,
        matchedCount: 0,
        processedCount: 0,
        message: "初期化中...",
        newPosts: 0,
        updatedPosts: 0,
      };
      const reportProgress = async () => {
        try { await job.updateProgress({ ...progress }); } catch { /* noop */ }
      };

      try {
        // ── 対象アカウントを取得 ──
        const accounts = genreId
          ? await db.select().from(referenceAccounts).where(eq(referenceAccounts.genreId, genreId))
          : await db.select().from(referenceAccounts);

        const threadsAccounts = accounts.filter((a) => a.platform === "threads");

        // ── ジャンルごとの buzzThresholds を事前取得（matchFilter 構築用）──
        const genreIds = Array.from(new Set(threadsAccounts.map((a) => a.genreId)));
        const genreRows = genreIds.length
          ? await Promise.all(
              genreIds.map((gid) =>
                db.select().from(adultGenres).where(eq(adultGenres.id, gid)).limit(1),
              ),
            )
          : [];
        const genreThresholds = new Map<string, {
          minLikes: number; minViews: number; minReplies: number; minReposts: number;
        } | null>();
        for (const rows of genreRows) {
          if (rows[0]) genreThresholds.set(rows[0].id, rows[0].buzzThresholds ?? null);
        }

        // ── matchFilter を構築 ──
        const userFilter = job.data.filter;
        const buildMatchFilter = (gid: string) => {
          const th = userFilter?.applyBuzzThreshold ? genreThresholds.get(gid) ?? null : null;
          const hasAny =
            (userFilter && (
              userFilter.minLikes != null || userFilter.maxLikes != null ||
              userFilter.minReplies != null || userFilter.maxReplies != null ||
              userFilter.minViews != null || userFilter.maxViews != null ||
              userFilter.minReposts != null || userFilter.maxReposts != null
            )) || th != null;
          if (!hasAny) return undefined;
          return (p: ScrapedPost) => {
            if (userFilter?.minLikes != null && p.likeCount < userFilter.minLikes) return false;
            if (userFilter?.maxLikes != null && p.likeCount > userFilter.maxLikes) return false;
            if (userFilter?.minReplies != null && p.replyCount < userFilter.minReplies) return false;
            if (userFilter?.maxReplies != null && p.replyCount > userFilter.maxReplies) return false;
            if (userFilter?.minViews != null && p.viewCount < userFilter.minViews) return false;
            if (userFilter?.maxViews != null && p.viewCount > userFilter.maxViews) return false;
            if (userFilter?.minReposts != null && p.repostCount < userFilter.minReposts) return false;
            if (userFilter?.maxReposts != null && p.repostCount > userFilter.maxReposts) return false;
            if (th) {
              if (p.likeCount < th.minLikes) return false;
              if (p.viewCount < th.minViews) return false;
              if (p.replyCount < th.minReplies) return false;
              if (p.repostCount < th.minReposts) return false;
            }
            return true;
          };
        };
        console.log(`[monitor-accounts] 対象アカウント: ${threadsAccounts.length}件 / 抽出上限: ${limit}件/アカウント`);

        progress.totalAccounts = threadsAccounts.length;
        progress.message = `${threadsAccounts.length}アカウントを処理予定`;
        await reportProgress();

        if (threadsAccounts.length === 0) {
          progress.phase = "done";
          progress.message = "対象アカウントなし";
          await reportProgress();
          return;
        }

        const threadsUser = process.env.THREADS_USERNAME;
        const threadsPass = process.env.THREADS_PASSWORD;

        const scraper = await createThreadsScraper(
          { headless: true, username: threadsUser },
          (msg) => console.log(`[monitor-accounts] ${msg}`),
        );

        await scraper.init();

        try {
          if (threadsUser && threadsPass) {
            await scraper.login(threadsUser, threadsPass);
          }

          for (let aIdx = 0; aIdx < threadsAccounts.length; aIdx++) {
            const account = threadsAccounts[aIdx];
            console.log(`[monitor-accounts] @${account.username} を監視中... (${aIdx + 1}/${threadsAccounts.length})`);

            progress.accountIndex = aIdx + 1;
            progress.currentAccount = account.username;
            progress.phase = "scraping-profile";
            progress.matchedCount = 0;
            progress.processedCount = 0;
            progress.targetMatches = limit;
            progress.message = `@${account.username} のプロフィールを取得中`;
            await reportProgress();

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

            // 投稿収集（詳細ページ巡回方式・人間的スピード）
            progress.phase = "scraping-posts";
            progress.message = `@${account.username} の投稿URLを収集中`;
            await reportProgress();

            const matchFilter = buildMatchFilter(account.genreId);
            const posts = await scraper.scrapeAccountPostsDetailed(account.username, limit, {
              postDelayMs,
              matchFilter,
              onPostScraped: (matched, target, processed, _post, isMatch) => {
                progress.matchedCount = matched;
                progress.targetMatches = target;
                progress.processedCount = processed;
                progress.message = matchFilter
                  ? `@${account.username} 合致 ${matched}/${target}（処理済 ${processed}${isMatch ? " ✓" : ""}）`
                  : `@${account.username} ${matched}/${target} 件目を抽出中`;
                reportProgress().catch(() => {});
              },
            });
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
                  // 新規投稿: 先にレコード作成 → 画像ダウンロード → ローカルパス更新
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

                  if (p.hasImage && p.imageUrls && p.imageUrls.length > 0) {
                    try {
                      const localPaths = await downloadPostImages(inserted.id, p.imageUrls);
                      if (localPaths.length > 0) {
                        await db.update(monitoredPosts)
                          .set({ localImagePaths: localPaths })
                          .where(eq(monitoredPosts.id, inserted.id));
                      }
                    } catch (e) {
                      console.warn(`[monitor-accounts] image download failed for ${inserted.id}:`, e);
                    }
                  }

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
            progress.newPosts += newPosts;
            progress.updatedPosts += updatedPosts;
            progress.message = `@${account.username} 完了（新規${newPosts}/更新${updatedPosts}）`;
            await reportProgress();
          }
        } finally {
          await scraper.close();
        }

        progress.phase = "done";
        progress.currentAccount = null;
        progress.message = `完了（新規${progress.newPosts}件 / 更新${progress.updatedPosts}件）`;
        await reportProgress();
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
