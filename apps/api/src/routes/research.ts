import { Hono } from "hono";
import { eq, desc, and, sql, gte, lte, inArray, asc } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  adultGenres,
  referenceAccounts,
  genreProfiles,
  monitoredPosts,
  postScoreSnapshots,
  accountDailySnapshots,
  similarAccounts,
} from "../db/schema.js";
import { analyzeGenreQueue, monitorAccountsQueue } from "../lib/queues.js";

export const researchRouter = new Hono();

// GET /api/research/genres — 全ジャンル一覧（最新プロファイルのstatus込み）
researchRouter.get("/genres", async (c) => {
  const genres = await db.query.adultGenres.findMany({
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    with: {
      referenceAccounts: true,
      genreProfiles: {
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: 1,
      },
    },
  });

  const result = genres.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    createdAt: g.createdAt,
    accountCount: g.referenceAccounts.length,
    latestProfile: g.genreProfiles[0]
      ? { status: g.genreProfiles[0].status, updatedAt: g.genreProfiles[0].updatedAt }
      : null,
  }));

  return c.json(result);
});

// POST /api/research/genres — ジャンル作成
researchRouter.post("/genres", async (c) => {
  const body = await c.req.json<{ name: string; description?: string }>();
  if (!body.name || body.name.trim() === "") {
    return c.json({ error: "name is required" }, 400);
  }
  const [genre] = await db.insert(adultGenres).values({
    name: body.name.trim(),
    description: body.description ?? null,
  }).returning();
  return c.json(genre, 201);
});

// GET /api/research/genres/:id — 単体取得（参考アカウント込み）
researchRouter.get("/genres/:id", async (c) => {
  const id = c.req.param("id");
  const genre = await db.query.adultGenres.findFirst({
    where: eq(adultGenres.id, id),
    with: {
      referenceAccounts: {
        orderBy: (t, { asc }) => [asc(t.createdAt)],
      },
    },
  });
  if (!genre) return c.json({ error: "Not found" }, 404);
  return c.json(genre);
});

// DELETE /api/research/genres/:id — 削除
researchRouter.delete("/genres/:id", async (c) => {
  const id = c.req.param("id");
  const genre = await db.query.adultGenres.findFirst({ where: eq(adultGenres.id, id) });
  if (!genre) return c.json({ error: "Not found" }, 404);
  await db.delete(adultGenres).where(eq(adultGenres.id, id));
  return c.json({ ok: true });
});

// POST /api/research/genres/:id/accounts — 参考アカウント追加
researchRouter.post("/genres/:id/accounts", async (c) => {
  const genreId = c.req.param("id");
  const genre = await db.query.adultGenres.findFirst({ where: eq(adultGenres.id, genreId) });
  if (!genre) return c.json({ error: "Genre not found" }, 404);

  const body = await c.req.json<{ username: string; platform?: string; notes?: string }>();
  if (!body.username || body.username.trim() === "") {
    return c.json({ error: "username is required" }, 400);
  }

  const username = body.username.trim().replace(/^@/, "");

  const [account] = await db.insert(referenceAccounts).values({
    genreId,
    username,
    platform: body.platform ?? "threads",
    notes: body.notes ?? null,
  }).returning();

  return c.json(account, 201);
});

// DELETE /api/research/genres/:id/accounts/:accountId — 参考アカウント削除
researchRouter.delete("/genres/:id/accounts/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  const account = await db.query.referenceAccounts.findFirst({
    where: eq(referenceAccounts.id, accountId),
  });
  if (!account) return c.json({ error: "Not found" }, 404);
  await db.delete(referenceAccounts).where(eq(referenceAccounts.id, accountId));
  return c.json({ ok: true });
});

// POST /api/research/genres/:id/analyze — 分析ジョブ投入
researchRouter.post("/genres/:id/analyze", async (c) => {
  const genreId = c.req.param("id");
  const genre = await db.query.adultGenres.findFirst({ where: eq(adultGenres.id, genreId) });
  if (!genre) return c.json({ error: "Genre not found" }, 404);

  // 実行中のジョブがあれば拒否
  const running = await db.query.genreProfiles.findFirst({
    where: (t, { and, eq }) => and(eq(t.genreId, genreId), eq(t.status, "running")),
  });
  if (running) return c.json({ error: "Analysis is already running" }, 409);

  // プロファイルレコード作成
  const [profile] = await db.insert(genreProfiles).values({
    genreId,
    status: "pending",
  }).returning();

  // BullMQジョブ投入
  await analyzeGenreQueue.add("analyze-genre", {
    genreId,
    profileId: profile.id,
    genreName: genre.name,
  });

  return c.json({ profileId: profile.id, status: "pending" }, 202);
});

// GET /api/research/genres/:id/profile — 最新プロファイル取得
researchRouter.get("/genres/:id/profile", async (c) => {
  const genreId = c.req.param("id");
  const profile = await db.query.genreProfiles.findFirst({
    where: eq(genreProfiles.genreId, genreId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  if (!profile) return c.json(null);
  return c.json(profile);
});

// GET /api/research/genres/:id/accounts-with-profile — プロフィール情報込みのアカウント一覧
researchRouter.get("/genres/:id/accounts-with-profile", async (c) => {
  const genreId = c.req.param("id");
  const accounts = await db.query.referenceAccounts.findMany({
    where: eq(referenceAccounts.genreId, genreId),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });
  return c.json(accounts);
});

// GET /api/research/genres/:id/posts — 監視投稿一覧（バズスコア順）
researchRouter.get("/genres/:id/posts", async (c) => {
  const genreId = c.req.param("id");
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam), 100) : 50;

  const posts = await db.query.monitoredPosts.findMany({
    where: eq(monitoredPosts.genreId, genreId),
    orderBy: (t, { desc }) => [desc(t.buzzScore)],
    limit,
  });
  return c.json(posts);
});

// GET /api/research/posts/:postId/history — 投稿スコアの時系列履歴
researchRouter.get("/posts/:postId/history", async (c) => {
  const postId = c.req.param("postId");
  const snapshots = await db.query.postScoreSnapshots.findMany({
    where: eq(postScoreSnapshots.monitoredPostId, postId),
    orderBy: (t, { asc }) => [asc(t.snapshotAt)],
  });
  return c.json(snapshots);
});

// POST /api/research/genres/:id/monitor — 監視ジョブを手動実行
researchRouter.post("/genres/:id/monitor", async (c) => {
  const genreId = c.req.param("id");
  const genre = await db.query.adultGenres.findFirst({ where: eq(adultGenres.id, genreId) });
  if (!genre) return c.json({ error: "Genre not found" }, 404);

  const job = await monitorAccountsQueue.add("monitor-accounts", { genreId });
  return c.json({ jobId: job.id, status: "queued" }, 202);
});

// ============================================================
// スコア監視: 日次スナップショット取得
// ============================================================

// GET /api/research/genres/:id/daily-snapshots — 日次推移データ
researchRouter.get("/genres/:id/daily-snapshots", async (c) => {
  const genreId = c.req.param("id");
  const days = parseInt(c.req.query("days") ?? "30");
  const accountId = c.req.query("accountId");

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromDateStr = fromDate.toISOString().split("T")[0];

  const conditions = [
    eq(accountDailySnapshots.genreId, genreId),
    gte(accountDailySnapshots.snapshotDate, fromDateStr),
  ];
  if (accountId) {
    conditions.push(eq(accountDailySnapshots.referenceAccountId, accountId));
  }

  const snapshots = await db
    .select()
    .from(accountDailySnapshots)
    .where(and(...conditions))
    .orderBy(asc(accountDailySnapshots.snapshotDate));

  return c.json(snapshots);
});

// GET /api/research/genres/:id/daily-aggregate — 全アカウント合算の日次推移
researchRouter.get("/genres/:id/daily-aggregate", async (c) => {
  const genreId = c.req.param("id");
  const days = parseInt(c.req.query("days") ?? "30");

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromDateStr = fromDate.toISOString().split("T")[0];

  const rows = await db
    .select({
      snapshotDate: accountDailySnapshots.snapshotDate,
      totalFollowers: sql<number>`sum(${accountDailySnapshots.followersCount})::int`,
      totalPosts: sql<number>`sum(${accountDailySnapshots.postsCount})::int`,
      totalDailyPosts: sql<number>`sum(${accountDailySnapshots.dailyPostsCount})::int`,
      totalLikes: sql<number>`sum(${accountDailySnapshots.totalLikes})::int`,
      totalImpressions: sql<number>`sum(${accountDailySnapshots.totalImpressions})::int`,
      totalReposts: sql<number>`sum(${accountDailySnapshots.totalReposts})::int`,
      totalReplies: sql<number>`sum(${accountDailySnapshots.totalReplies})::int`,
      avgEngagementRate: sql<number>`avg(${accountDailySnapshots.engagementRate})::real`,
      accountCount: sql<number>`count(distinct ${accountDailySnapshots.referenceAccountId})::int`,
    })
    .from(accountDailySnapshots)
    .where(
      and(
        eq(accountDailySnapshots.genreId, genreId),
        gte(accountDailySnapshots.snapshotDate, fromDateStr),
      ),
    )
    .groupBy(accountDailySnapshots.snapshotDate)
    .orderBy(asc(accountDailySnapshots.snapshotDate));

  return c.json(rows);
});

// POST /api/research/genres/:id/snapshot — 日次スナップショットを今すぐ生成
researchRouter.post("/genres/:id/snapshot", async (c) => {
  const genreId = c.req.param("id");
  const genre = await db.query.adultGenres.findFirst({ where: eq(adultGenres.id, genreId) });
  if (!genre) return c.json({ error: "Genre not found" }, 404);

  const accounts = await db.query.referenceAccounts.findMany({
    where: eq(referenceAccounts.genreId, genreId),
  });

  const today = new Date().toISOString().split("T")[0];
  let created = 0;

  for (const acc of accounts) {
    // 今日の投稿に対するメトリクス集計
    const postMetrics = await db
      .select({
        totalLikes: sql<number>`coalesce(sum(${monitoredPosts.likeCount}), 0)::int`,
        totalImpressions: sql<number>`coalesce(sum(${monitoredPosts.viewCount}), 0)::int`,
        totalReposts: sql<number>`coalesce(sum(${monitoredPosts.repostCount}), 0)::int`,
        totalReplies: sql<number>`coalesce(sum(${monitoredPosts.replyCount}), 0)::int`,
        topBuzz: sql<number>`coalesce(max(${monitoredPosts.buzzScore}), 0)::real`,
        postCount: sql<number>`count(*)::int`,
      })
      .from(monitoredPosts)
      .where(eq(monitoredPosts.referenceAccountId, acc.id));

    const pm = postMetrics[0];
    const engRate = acc.followersCount && acc.followersCount > 0
      ? (pm.totalLikes + pm.totalReposts + pm.totalReplies) / acc.followersCount
      : 0;

    // UPSERT
    await db.execute(sql`
      INSERT INTO account_daily_snapshots (
        id, reference_account_id, genre_id, snapshot_date,
        followers_count, posts_count, daily_posts_count,
        total_likes, total_impressions, total_reposts, total_replies,
        engagement_rate, top_post_buzz_score
      ) VALUES (
        gen_random_uuid(), ${acc.id}, ${genreId}, ${today},
        ${acc.followersCount ?? 0}, ${acc.postsCount ?? 0}, ${pm.postCount},
        ${pm.totalLikes}, ${pm.totalImpressions}, ${pm.totalReposts}, ${pm.totalReplies},
        ${engRate}, ${pm.topBuzz}
      )
      ON CONFLICT (reference_account_id, snapshot_date)
      DO UPDATE SET
        followers_count = EXCLUDED.followers_count,
        posts_count = EXCLUDED.posts_count,
        daily_posts_count = EXCLUDED.daily_posts_count,
        total_likes = EXCLUDED.total_likes,
        total_impressions = EXCLUDED.total_impressions,
        total_reposts = EXCLUDED.total_reposts,
        total_replies = EXCLUDED.total_replies,
        engagement_rate = EXCLUDED.engagement_rate,
        top_post_buzz_score = EXCLUDED.top_post_buzz_score
    `);
    created++;
  }

  return c.json({ created, date: today });
});

// ============================================================
// 成長分析
// ============================================================

// GET /api/research/genres/:id/growth — アカウント別成長分析
researchRouter.get("/genres/:id/growth", async (c) => {
  const genreId = c.req.param("id");

  const accounts = await db.query.referenceAccounts.findMany({
    where: eq(referenceAccounts.genreId, genreId),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  const growthData = [];

  for (const acc of accounts) {
    // 日次スナップショットの推移
    const dailyData = await db
      .select()
      .from(accountDailySnapshots)
      .where(eq(accountDailySnapshots.referenceAccountId, acc.id))
      .orderBy(asc(accountDailySnapshots.snapshotDate));

    // バズ投稿（転機となった投稿）
    const buzzPosts = await db
      .select()
      .from(monitoredPosts)
      .where(
        and(
          eq(monitoredPosts.referenceAccountId, acc.id),
          gte(monitoredPosts.buzzScore, 0.005),
        ),
      )
      .orderBy(desc(monitoredPosts.buzzScore))
      .limit(10);

    // フォロワー増加率の計算
    let followerGrowthRate = 0;
    if (dailyData.length >= 2) {
      const first = dailyData[0].followersCount ?? 0;
      const last = dailyData[dailyData.length - 1].followersCount ?? 0;
      followerGrowthRate = first > 0 ? ((last - first) / first) * 100 : 0;
    }

    growthData.push({
      account: acc,
      dailyData,
      buzzPosts,
      followerGrowthRate,
      dataPoints: dailyData.length,
    });
  }

  return c.json(growthData);
});

// ============================================================
// 類似アカウント
// ============================================================

// GET /api/research/genres/:id/similar — 類似アカウント一覧
researchRouter.get("/genres/:id/similar", async (c) => {
  const genreId = c.req.param("id");
  const results = await db
    .select()
    .from(similarAccounts)
    .where(eq(similarAccounts.genreId, genreId))
    .orderBy(desc(similarAccounts.similarityScore));
  return c.json(results);
});

// POST /api/research/genres/:id/similar — 類似アカウント追加
researchRouter.post("/genres/:id/similar", async (c) => {
  const genreId = c.req.param("id");
  const body = await c.req.json<{
    referenceAccountId: string;
    username: string;
    platform?: string;
    followersCount?: number;
    bio?: string;
    similarityScore?: number;
    similarityReason?: string;
  }>();

  const [result] = await db.insert(similarAccounts).values({
    genreId,
    referenceAccountId: body.referenceAccountId,
    username: body.username,
    platform: body.platform ?? "threads",
    followersCount: body.followersCount,
    bio: body.bio,
    similarityScore: body.similarityScore ?? 0,
    similarityReason: body.similarityReason,
  }).returning();

  return c.json(result, 201);
});

// POST /api/research/similar/:id/add — 類似アカウントを参考アカウントに追加
researchRouter.post("/similar/:id/add", async (c) => {
  const id = c.req.param("id");
  const similar = await db.query.similarAccounts.findFirst({
    where: eq(similarAccounts.id, id),
  });
  if (!similar) return c.json({ error: "Not found" }, 404);

  const [account] = await db.insert(referenceAccounts).values({
    genreId: similar.genreId,
    username: similar.username,
    platform: similar.platform,
  }).returning();

  await db.update(similarAccounts)
    .set({ isAdded: true })
    .where(eq(similarAccounts.id, id));

  return c.json(account, 201);
});

// ============================================================
// パフォーマンスランキング（自分の投稿）
// ============================================================

// GET /api/research/performance — 投稿パフォーマンスランキング
researchRouter.get("/performance", async (c) => {
  const metric = c.req.query("metric") ?? "likes"; // likes | impressions | engagement | initial
  const limit = parseInt(c.req.query("limit") ?? "50");
  const accountId = c.req.query("accountId");

  // postMetrics の最新スナップショットを取得
  const postsQuery = db.execute(sql`
    WITH latest_metrics AS (
      SELECT DISTINCT ON (post_id)
        post_id,
        likes,
        reposts,
        replies,
        views,
        collected_at
      FROM post_metrics
      ORDER BY post_id, collected_at DESC
    ),
    first_metrics AS (
      SELECT DISTINCT ON (post_id)
        post_id,
        likes as initial_likes,
        views as initial_views,
        collected_at as first_collected_at
      FROM post_metrics
      ORDER BY post_id, collected_at ASC
    )
    SELECT
      p.id,
      p.account_id,
      p.platform,
      p.content_text,
      p.status,
      p.posted_at,
      p.created_at,
      lm.likes,
      lm.reposts,
      lm.replies,
      lm.views,
      lm.collected_at as last_metrics_at,
      fm.initial_likes,
      fm.initial_views,
      fm.first_collected_at,
      CASE WHEN lm.views > 0
        THEN (lm.likes + lm.reposts + lm.replies)::real / lm.views
        ELSE 0
      END as engagement_rate,
      a.username as account_username,
      a.display_name as account_display_name
    FROM posts p
    JOIN latest_metrics lm ON lm.post_id = p.id
    LEFT JOIN first_metrics fm ON fm.post_id = p.id
    LEFT JOIN accounts a ON a.id = p.account_id
    WHERE p.status = 'posted'
    ${accountId ? sql`AND p.account_id = ${accountId}` : sql``}
    ORDER BY ${
      metric === "likes" ? sql`lm.likes DESC NULLS LAST` :
      metric === "impressions" ? sql`lm.views DESC NULLS LAST` :
      metric === "engagement" ? sql`engagement_rate DESC NULLS LAST` :
      sql`fm.initial_likes DESC NULLS LAST`
    }
    LIMIT ${limit}
  `);

  const posts = await postsQuery;
  return c.json(posts);
});

// GET /api/research/performance/summary — パフォーマンスサマリー
researchRouter.get("/performance/summary", async (c) => {
  const accountId = c.req.query("accountId");

  const result = await db.execute(sql`
    WITH latest_metrics AS (
      SELECT DISTINCT ON (post_id)
        post_id,
        likes,
        reposts,
        replies,
        views
      FROM post_metrics
      ORDER BY post_id, collected_at DESC
    )
    SELECT
      count(*)::int as total_posts,
      coalesce(avg(lm.likes), 0)::real as avg_likes,
      coalesce(avg(lm.views), 0)::real as avg_impressions,
      coalesce(max(lm.likes), 0)::int as max_likes,
      coalesce(max(lm.views), 0)::int as max_impressions,
      coalesce(avg(
        CASE WHEN lm.views > 0
          THEN (lm.likes + lm.reposts + lm.replies)::real / lm.views
          ELSE 0
        END
      ), 0)::real as avg_engagement_rate
    FROM posts p
    JOIN latest_metrics lm ON lm.post_id = p.id
    WHERE p.status = 'posted'
    ${accountId ? sql`AND p.account_id = ${accountId}` : sql``}
  `);

  return c.json(result[0] ?? {});
});
