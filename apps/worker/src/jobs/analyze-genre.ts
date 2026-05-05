import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import { pgTable, uuid, varchar, text, jsonb, integer, timestamp, boolean, real, index } from "drizzle-orm/pg-core";
import { calcBuzzScore } from "../browser/threads-scraper.js";
import { createThreadsScraper } from "../browser/threads-scraper-factory.js";
import { downloadPostImages } from "./download-images.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
export const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null }) as any;

// ── ローカルスキーマ定義 ──────────────────────────────────────────────────────
const referenceAccounts = pgTable("reference_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  genreId: uuid("genre_id").notNull(),
  username: varchar("username", { length: 100 }).notNull(),
  platform: varchar("platform", { length: 20 }).default("threads").notNull(),
  notes: text("notes"),
  accountCreatedAt: varchar("account_created_at", { length: 50 }),
  accountAgeMonths: integer("account_age_months"),
  followersCount: integer("followers_count"),
  bio: text("bio"),
  postsCount: integer("posts_count"),
  lastProfileScrapedAt: timestamp("last_profile_scraped_at"),
});

const genreProfiles = pgTable("genre_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  genreId: uuid("genre_id").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  scrapedPostsCount: integer("scraped_posts_count").default(0),
  profileJson: jsonb("profile_json"),
  rawPosts: jsonb("raw_posts"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const adultGenres = pgTable("adult_genres", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
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
  index("idx_monitored_posts_genre").on(t.genreId),
  index("idx_monitored_posts_account").on(t.referenceAccountId),
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
export interface AnalyzeGenreJobData {
  genreId: string;
  profileId: string;
  genreName: string;
}

// ── ヘルパー：投稿テキストの要約（長い投稿は切り詰め） ──────────────────────
function truncate(s: string, max = 200): string {
  return s.length > max ? s.substring(0, max) + "…" : s;
}

// ── ワーカー ─────────────────────────────────────────────────────────────────
export function createAnalyzeGenreWorker() {
  const worker = new Worker<AnalyzeGenreJobData>(
    "analyze-genre",
    async (job: Job<AnalyzeGenreJobData>) => {
      const { genreId, profileId, genreName } = job.data;
      const sqlClient = postgres(
        process.env.DATABASE_URL ?? "postgresql://sns_user:sns_password@localhost:5432/sns_automation",
      );
      const db = drizzle(sqlClient, {
        schema: { referenceAccounts, genreProfiles, adultGenres, monitoredPosts, postScoreSnapshots },
      });

      const updateProfile = async (fields: Partial<{
        status: string;
        scrapedPostsCount: number;
        profileJson: unknown;
        rawPosts: unknown;
        errorMessage: string | null;
      }>) => {
        await db
          .update(genreProfiles)
          .set({ ...(fields as any), updatedAt: new Date() })
          .where(eq(genreProfiles.id, profileId));
      };

      try {
        await updateProfile({ status: "running", errorMessage: "参考アカウントを取得中..." });

        // ── 参考アカウント取得 ──
        const accounts = await db
          .select()
          .from(referenceAccounts)
          .where(eq(referenceAccounts.genreId, genreId));

        if (accounts.length === 0) {
          await updateProfile({ status: "failed", errorMessage: "参考アカウントが登録されていません" });
          return;
        }

        // ── スクレイパー初期化 ──
        const threadsUser = process.env.THREADS_USERNAME;
        const threadsPass = process.env.THREADS_PASSWORD;

        const scraper = await createThreadsScraper(
          { headless: true, username: threadsUser },
          async (msg) => {
            console.log(`[analyze-genre] ${msg}`);
            await updateProfile({ errorMessage: msg });
          },
        );

        await scraper.init();

        try {
          if (threadsUser && threadsPass) {
            await scraper.login(threadsUser, threadsPass);
          }

          // ── アカウントごとにプロフィール + 投稿を収集 ──
          interface RichPost {
            username: string;
            accountCreatedAt: string | null;
            accountAgeMonths: number | null;
            followersCount: number | null;
            contentText: string;
            imageUrls: string[];
            hasImage: boolean;
            likeCount: number;
            repostCount: number;
            replyCount: number;
            viewCount: number;
            buzzScore: number;
            platformPostId: string | null;
            postedAt: Date | null;
          }

          const allPosts: RichPost[] = [];

          for (const account of accounts) {
            if (account.platform !== "threads") continue;

            // プロフィール取得
            await updateProfile({ errorMessage: `@${account.username} のプロフィールを取得中...` });
            const profile = await scraper.scrapeAccountProfile(account.username);

            // DB更新（プロフィール情報を保存）
            await db
              .update(referenceAccounts)
              .set({
                accountCreatedAt: profile.accountCreatedAt,
                accountAgeMonths: profile.accountAgeMonths,
                followersCount: profile.followersCount,
                bio: profile.bio,
                postsCount: profile.postsCount,
                lastProfileScrapedAt: new Date(),
              })
              .where(eq(referenceAccounts.id, account.id));

            // 投稿収集
            // リスト表示ベースの scrapeAccountPosts はエンゲージメント値（いいね/インプレ）が
            // 取れないことが多いため、詳細ページ巡回版に切り替えて確実なメトリクスを取得する。
            await updateProfile({ errorMessage: `@${account.username} の投稿を収集中...` });
            await job.updateProgress({
              phase: "collecting",
              currentAccount: account.username,
              processed: 0,
              target: 30,
              matched: 0,
              message: `@${account.username} の投稿を収集中...`,
            });
            const posts = await scraper.scrapeAccountPostsDetailed(account.username, 30, {
              postDelayMs: [4_000, 9_000],
              onPostScraped: (matched, target, processed) => {
                const msg = `@${account.username}: 抽出中 (${processed}/${target} 処理, 合致 ${matched})`;
                void updateProfile({ errorMessage: msg, scrapedPostsCount: processed });
                void job.updateProgress({
                  phase: "collecting",
                  currentAccount: account.username,
                  processed,
                  target,
                  matched,
                  message: msg,
                });
              },
            });

            for (const p of posts) {
              const { buzzScore } = calcBuzzScore({
                ...p,
                authorFollowers: profile.followersCount,
              });

              // monitored_posts にアップサート（platformPostIdがあれば更新、なければ新規）
              if (p.platformPostId) {
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
                  // スコアを更新
                  await db.update(monitoredPosts).set({
                    likeCount: p.likeCount,
                    repostCount: p.repostCount,
                    replyCount: p.replyCount,
                    viewCount: p.viewCount,
                    buzzScore,
                    lastSnapshotAt: new Date(),
                  }).where(eq(monitoredPosts.id, existing[0].id));

                  // スナップショット追記
                  await db.insert(postScoreSnapshots).values({
                    monitoredPostId: existing[0].id,
                    likeCount: p.likeCount,
                    repostCount: p.repostCount,
                    replyCount: p.replyCount,
                    viewCount: p.viewCount,
                    buzzScore,
                  });
                } else {
                  // 新規挿入: テキスト保存後に画像をダウンロードしてローカルパスを補強
                  const [inserted] = await db.insert(monitoredPosts).values({
                    referenceAccountId: account.id,
                    genreId,
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
                      console.warn(`[analyze-genre] image download failed for ${inserted.id}:`, e);
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
                }
              } else {
                // platformPostIdなし → 単純挿入（スナップショットのみ）
                const [inserted] = await db.insert(monitoredPosts).values({
                  referenceAccountId: account.id,
                  genreId,
                  platformPostId: null,
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
                    console.warn(`[analyze-genre] image download failed for ${inserted.id}:`, e);
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
              }

              allPosts.push({
                username: account.username,
                accountCreatedAt: profile.accountCreatedAt,
                accountAgeMonths: profile.accountAgeMonths,
                followersCount: profile.followersCount,
                contentText: p.contentText,
                imageUrls: p.imageUrls,
                hasImage: p.hasImage,
                likeCount: p.likeCount,
                repostCount: p.repostCount,
                replyCount: p.replyCount,
                viewCount: p.viewCount,
                buzzScore,
                platformPostId: p.platformPostId,
                postedAt: p.postedAt,
              });
            }
          }

          await updateProfile({ scrapedPostsCount: allPosts.length, rawPosts: allPosts });

          if (allPosts.length === 0) {
            await updateProfile({ status: "failed", errorMessage: "投稿を収集できませんでした" });
            return;
          }

          // ── Gemini 分析（APIキーがない場合はスキップして完了） ──
          const geminiKey = process.env.GEMINI_API_KEY ?? "";
          if (!geminiKey) {
            await updateProfile({ status: "completed", errorMessage: null });
            console.log(`[analyze-genre] genreId=${genreId} completed (no Gemini key, AI analysis skipped). posts=${allPosts.length}`);
            return;
          }

          await updateProfile({ errorMessage: "Geminiで詳細分析中..." });
          const genai = new GoogleGenerativeAI(geminiKey);
          const model = genai.getGenerativeModel({ model: "gemini-2.0-flash" });

          // バズスコア上位で絞り込み（最大60件）
          const sortedPosts = [...allPosts].sort((a, b) => b.buzzScore - a.buzzScore).slice(0, 60);

          const postsText = sortedPosts
            .map((p, i) => {
              const ageLabel = p.accountAgeMonths !== null
                ? `開設${p.accountAgeMonths}ヶ月`
                : "開設時期不明";
              const followersLabel = p.followersCount !== null
                ? `${p.followersCount.toLocaleString()}フォロワー`
                : "フォロワー不明";
              const imageLabel = p.hasImage
                ? `画像あり(${p.imageUrls.length}枚)`
                : "テキストのみ";
              return [
                `[${i + 1}] @${p.username} (${ageLabel} / ${followersLabel})`,
                `形式: ${imageLabel}`,
                `本文: ${truncate(p.contentText, 250)}`,
                `エンゲージメント: いいね${p.likeCount} リポスト${p.repostCount} 返信${p.replyCount} バズスコア${p.buzzScore.toFixed(4)}`,
              ].join("\n");
            })
            .join("\n\n---\n\n");

          const prompt = `
あなたはSNSマーケティングの専門家です。
以下は「${genreName}」ジャンルの参考Threadsアカウントの実際の投稿データです。

【分析の重点事項】
1. 新規アカウント優先の戦略抽出：開設6ヶ月以内のアカウントのパターンに特に注目し、今から始める人でも再現できる戦略を抽出
2. バズのトリガー分析：何がきっかけで急拡散しているか（フック文言・タイミング・話題性など）
3. 画像の効果分析：どんな種類の画像を使った投稿がバズっているか、テキストのみとの違い
4. 画像×テキストの組み合わせパターン：どの画像タイプ×テキストパターンが最もエンゲージメントを生むか
5. キーワードトレンド：現在タイムリーに流行中のキーワードと常時有効なキーワードを区別

以下のJSON形式で回答してください（日本語で）：

{
  "genreSummary": "このジャンルの特徴を1-2文で説明",
  "accountAgeInsights": {
    "newAccountStrategy": "新規アカウント（0-6ヶ月）が使うべき最優先戦略",
    "earlyGrowthPattern": "開設初期にバズりやすい投稿パターンの特徴",
    "reproducibility": "0フォロワーから始めても再現できる具体的な方法"
  },
  "buzzTriggers": [
    { "trigger": "バズトリガー名", "mechanism": "どのメカニズムで拡散するか", "example": "具体的な例文や状況" }
  ],
  "imageAnalysis": {
    "bestImageTypes": ["効果が高い画像の種類（例: 自撮り風・コスプレ・日常シーン）"],
    "imageCharacteristics": "バズる画像に共通する特徴（構図・雰囲気・色調など）",
    "imageVsNoImage": "画像あり投稿とテキストのみ投稿の効果の違い"
  },
  "imageTextCombos": [
    { "imageType": "画像タイプ", "textPattern": "テキストパターン（例: 問いかけ型・告白型）", "effectiveness": "この組み合わせが効く理由" }
  ],
  "toneAndStyle": {
    "description": "文体・口調の特徴（キャラ設定・言葉遣いなど）",
    "examples": ["特徴的な表現例を3つ（実際の投稿から抽出）"]
  },
  "hookPatterns": [
    { "name": "パターン名", "description": "フックのメカニズム", "example": "実際に使える例文" }
  ],
  "topicClusters": ["よく扱うトピック（具体的なテーマ）"],
  "emojiUsage": "絵文字の使い方の特徴（種類・頻度・位置）",
  "postStructure": "投稿の構成（行数・段落・流れ）",
  "callToAction": "Instagram誘導・フォロー促進の具体的な方法",
  "avoidedWords": ["シャドウバンや凍結リスクがある避けるべき直接表現"],
  "trendingKeywords": {
    "timeSensitive": ["現在タイムリーに流行中のキーワード（使用推奨：数週間〜数ヶ月）"],
    "evergreen": ["常時有効で長期間使えるキーワード"],
    "risky": ["使いすぎるとリスクになるキーワード"]
  },
  "recommendedKeywords": ["収集・リサーチに使うべきキーワード10個（間接的表現優先）"],
  "accountCharacteristics": "このジャンルのアカウントに共通するプロフィール・設定の特徴",
  "topBuzzPosts": [
    {
      "username": "@アカウント名",
      "accountAgeSummary": "開設X ヶ月時点",
      "contentSummary": "投稿内容の要約（50文字以内）",
      "likeCount": 0,
      "repostCount": 0,
      "hasImage": false,
      "buzzReason": "なぜこの投稿がバズったか（具体的な分析）"
    }
  ]
}

--- 投稿データ（バズスコア順上位${sortedPosts.length}件） ---
${postsText}

必ずJSONのみで回答してください。マークダウンコードブロックは使わないこと。
`;

          let profileJson: unknown = null;
          try {
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) profileJson = JSON.parse(jsonMatch[0]);
          } catch (aiErr) {
            console.warn(`[analyze-genre] Gemini analysis failed (posts saved): ${aiErr}`);
          }

          await updateProfile({ status: "completed", profileJson, errorMessage: null });
          console.log(`[analyze-genre] genreId=${genreId} completed. posts=${allPosts.length}${profileJson ? "" : " (AI analysis skipped)"}`);
        } finally {
          await scraper.close();
        }
      } catch (err) {
        await updateProfile({ status: "failed", errorMessage: String(err) });
        throw err;
      } finally {
        await sqlClient.end();
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[analyze-genre] job ${job?.id} failed:`, err.message);
  });

  return worker;
}
