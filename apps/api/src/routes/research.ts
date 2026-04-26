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
  accounts,
  posts,
  scheduledPosts,
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
    buzzThresholds: g.buzzThresholds,
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
  let body: { name?: unknown; description?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "リクエストの形式が不正です（JSONパース失敗）" }, 400);
  }

  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  if (rawName === "") {
    return c.json({ error: "グループ名は必須です" }, 400);
  }
  if (rawName.length > 100) {
    return c.json(
      { error: `グループ名は100文字以内で入力してください（現在 ${rawName.length} 文字）` },
      400,
    );
  }

  const description =
    typeof body.description === "string" && body.description.trim() !== ""
      ? body.description
      : null;

  try {
    const [genre] = await db
      .insert(adultGenres)
      .values({ name: rawName, description })
      .returning();
    return c.json(genre, 201);
  } catch (err) {
    console.error("[POST /api/research/genres] DB error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `グループ作成に失敗しました: ${msg}` }, 500);
  }
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

// POST /api/research/genres/:id/queue-bulk-repost
//   monitored_posts の上位N件を、指定アカウント群でラウンドロビン分配し、
//   N分おきに予約投稿として登録する。
//   Body:
//     accountIds     string[] (必須) — 投稿先アカウント (1〜10件)。後方互換で accountId も可
//     count          number (必須, 1-100) — 上位何件を投稿するか
//     intervalMinutes number (必須, 1-1440) — 投稿間隔（分）
//     startAt        string (任意) — 1件目の投稿時刻 (ISO8601, 既定: now+1分)
//     orderBy        "buzz"|"likes"|"views"|"replies"|"reposts" (既定: views=インプレッション)
//     applyBuzzThreshold boolean (任意) — グループのバズ閾値も適用
researchRouter.post("/genres/:id/queue-bulk-repost", async (c) => {
  const genreId = c.req.param("id");

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "リクエストの形式が不正です（JSONパース失敗）" }, 400);
  }

  // accountIds: string[] を受け付け。単一 accountId も後方互換でサポート。
  const accountIds: string[] = (() => {
    if (Array.isArray(body.accountIds)) {
      return body.accountIds.filter((x): x is string => typeof x === "string" && x.length > 0);
    }
    if (typeof body.accountId === "string" && body.accountId) return [body.accountId];
    return [];
  })();
  if (accountIds.length === 0) {
    return c.json({ error: "accountIds は必須です（1件以上）" }, 400);
  }
  if (accountIds.length > 10) {
    return c.json({ error: "accountIds は最大10件まで指定できます" }, 400);
  }

  const count =
    typeof body.count === "number" && Number.isFinite(body.count)
      ? Math.floor(body.count)
      : NaN;
  if (!Number.isFinite(count) || count < 1 || count > 100) {
    return c.json({ error: "count は 1〜100 の整数で指定してください" }, 400);
  }

  const intervalMinutes =
    typeof body.intervalMinutes === "number" && Number.isFinite(body.intervalMinutes)
      ? Math.floor(body.intervalMinutes)
      : NaN;
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
    return c.json({ error: "intervalMinutes は 1〜1440 の整数で指定してください" }, 400);
  }

  const startAt = (() => {
    if (typeof body.startAt === "string" && body.startAt) {
      const d = new Date(body.startAt);
      if (Number.isNaN(d.getTime())) return null;
      return d;
    }
    return new Date(Date.now() + 60 * 1000); // 既定は1分後
  })();
  if (!startAt) return c.json({ error: "startAt の形式が不正です（ISO8601）" }, 400);

  const orderBy = (() => {
    switch (body.orderBy) {
      case "likes": return monitoredPosts.likeCount;
      case "views": return monitoredPosts.viewCount;
      case "replies": return monitoredPosts.replyCount;
      case "reposts": return monitoredPosts.repostCount;
      case "buzz":
      case undefined:
      case null:
        return monitoredPosts.buzzScore;
      default:
        return monitoredPosts.buzzScore;
    }
  })();

  // ジャンル存在チェック
  const genre = await db.query.adultGenres.findFirst({ where: eq(adultGenres.id, genreId) });
  if (!genre) return c.json({ error: "グループが見つかりません" }, 404);

  // アカウント存在チェック（指定順を保持してラウンドロビン分配で使う）
  const targetAccountsRaw = await db.query.accounts.findMany({
    where: inArray(accounts.id, accountIds),
  });
  const targetAccountsById = new Map(targetAccountsRaw.map((a) => [a.id, a]));
  const targetAccounts: typeof targetAccountsRaw = [];
  for (const id of accountIds) {
    const a = targetAccountsById.get(id);
    if (!a) return c.json({ error: `投稿アカウントが見つかりません: ${id}` }, 404);
    if (a.platform !== "threads") {
      return c.json(
        { error: `@${a.username} は Threads アカウントではありません（${a.platform}）` },
        400,
      );
    }
    if (a.status !== "active") {
      return c.json(
        { error: `@${a.username} が稼働中ではありません（status=${a.status}）` },
        400,
      );
    }
    targetAccounts.push(a);
  }

  // バズ閾値も適用するかどうか
  const conditions = [eq(monitoredPosts.genreId, genreId)];
  if (body.applyBuzzThreshold === true) {
    const t = genre.buzzThresholds;
    if (t) {
      if (t.minLikes && t.minLikes > 0) conditions.push(gte(monitoredPosts.likeCount, t.minLikes));
      if (t.minViews && t.minViews > 0) conditions.push(gte(monitoredPosts.viewCount, t.minViews));
      if (t.minReplies && t.minReplies > 0)
        conditions.push(gte(monitoredPosts.replyCount, t.minReplies));
      if (t.minReposts && t.minReposts > 0)
        conditions.push(gte(monitoredPosts.repostCount, t.minReposts));
    }
  }

  // 上位 count 件を取得
  const topPosts = await db
    .select()
    .from(monitoredPosts)
    .where(and(...conditions))
    .orderBy(desc(orderBy))
    .limit(count);

  if (topPosts.length === 0) {
    return c.json({ error: "対象となる投稿がありません" }, 400);
  }

  // posts と scheduled_posts を順番に作成。
  // 投稿先アカウントはラウンドロビン (i % targetAccounts.length) で分配する。
  const created: Array<{
    monitoredPostId: string;
    postId: string;
    scheduledPostId: string;
    scheduledAt: string;
    accountId: string;
    accountUsername: string;
  }> = [];

  for (let i = 0; i < topPosts.length; i++) {
    const mp = topPosts[i];
    const scheduledAt = new Date(startAt.getTime() + i * intervalMinutes * 60 * 1000);
    const targetAccount = targetAccounts[i % targetAccounts.length];

    const [createdPost] = await db
      .insert(posts)
      .values({
        accountId: targetAccount.id,
        platform: "threads",
        contentText: mp.contentText,
        status: "scheduled",
        metadata: {
          source: "monitored_post_repost",
          monitoredPostId: mp.id,
          genreId,
          buzzScore: mp.buzzScore,
          likeCount: mp.likeCount,
          viewCount: mp.viewCount,
          imageUrls: mp.imageUrls ?? [],
        },
      })
      .returning({ id: posts.id });

    const [createdSched] = await db
      .insert(scheduledPosts)
      .values({
        postId: createdPost.id,
        scheduledAt,
        status: "pending",
      })
      .returning({ id: scheduledPosts.id });

    created.push({
      monitoredPostId: mp.id,
      postId: createdPost.id,
      scheduledPostId: createdSched.id,
      scheduledAt: scheduledAt.toISOString(),
      accountId: targetAccount.id,
      accountUsername: targetAccount.username,
    });
  }

  return c.json(
    {
      ok: true,
      requestedCount: count,
      scheduledCount: created.length,
      accountIds: targetAccounts.map((a) => a.id),
      accountUsernames: targetAccounts.map((a) => a.username),
      intervalMinutes,
      firstAt: created[0]?.scheduledAt,
      lastAt: created[created.length - 1]?.scheduledAt,
      items: created,
    },
    201,
  );
});

// GET /api/research/genres/:id/posts — 監視投稿一覧（バズスコア順、エンゲージメント指標フィルタ対応）
// クエリパラメータ:
//   minLikes, maxLikes, minReplies, maxReplies, minViews, maxViews,
//   minReposts, maxReposts, since (ISO日付), until (ISO日付),
//   applyBuzzThreshold=true でグループ設定の buzzThresholds も適用
//   orderBy=buzz|likes|views|replies|reposts|postedAt (default: buzz)
//   limit (default 50, max 200)
researchRouter.get("/genres/:id/posts", async (c) => {
  const genreId = c.req.param("id");
  const q = c.req.query();
  const limit = q.limit ? Math.min(parseInt(q.limit), 200) : 50;

  const conditions = [eq(monitoredPosts.genreId, genreId)];

  const numQuery = (key: string) => {
    const v = q[key];
    if (v === undefined || v === "") return undefined;
    const n = parseInt(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const minLikes = numQuery("minLikes");
  const maxLikes = numQuery("maxLikes");
  const minReplies = numQuery("minReplies");
  const maxReplies = numQuery("maxReplies");
  const minViews = numQuery("minViews");
  const maxViews = numQuery("maxViews");
  const minReposts = numQuery("minReposts");
  const maxReposts = numQuery("maxReposts");

  // グループ設定のバズ閾値も適用する場合
  if (q.applyBuzzThreshold === "true") {
    const genre = await db.query.adultGenres.findFirst({ where: eq(adultGenres.id, genreId) });
    const t = genre?.buzzThresholds;
    if (t) {
      if (t.minLikes && t.minLikes > 0)
        conditions.push(gte(monitoredPosts.likeCount, t.minLikes));
      if (t.minViews && t.minViews > 0)
        conditions.push(gte(monitoredPosts.viewCount, t.minViews));
      if (t.minReplies && t.minReplies > 0)
        conditions.push(gte(monitoredPosts.replyCount, t.minReplies));
      if (t.minReposts && t.minReposts > 0)
        conditions.push(gte(monitoredPosts.repostCount, t.minReposts));
    }
  }

  if (minLikes !== undefined) conditions.push(gte(monitoredPosts.likeCount, minLikes));
  if (maxLikes !== undefined) conditions.push(lte(monitoredPosts.likeCount, maxLikes));
  if (minReplies !== undefined) conditions.push(gte(monitoredPosts.replyCount, minReplies));
  if (maxReplies !== undefined) conditions.push(lte(monitoredPosts.replyCount, maxReplies));
  if (minViews !== undefined) conditions.push(gte(monitoredPosts.viewCount, minViews));
  if (maxViews !== undefined) conditions.push(lte(monitoredPosts.viewCount, maxViews));
  if (minReposts !== undefined) conditions.push(gte(monitoredPosts.repostCount, minReposts));
  if (maxReposts !== undefined) conditions.push(lte(monitoredPosts.repostCount, maxReposts));

  if (q.since) {
    const d = new Date(q.since);
    if (!Number.isNaN(d.getTime())) conditions.push(gte(monitoredPosts.postedAt, d));
  }
  if (q.until) {
    const d = new Date(q.until);
    if (!Number.isNaN(d.getTime())) conditions.push(lte(monitoredPosts.postedAt, d));
  }

  const orderCol = (() => {
    switch (q.orderBy) {
      case "likes": return monitoredPosts.likeCount;
      case "views": return monitoredPosts.viewCount;
      case "replies": return monitoredPosts.replyCount;
      case "reposts": return monitoredPosts.repostCount;
      case "postedAt": return monitoredPosts.postedAt;
      default: return monitoredPosts.buzzScore;
    }
  })();

  const posts = await db
    .select()
    .from(monitoredPosts)
    .where(and(...conditions))
    .orderBy(desc(orderCol))
    .limit(limit);

  return c.json(posts);
});

// POST /api/research/genres/:id/accounts/bulk — 複数アカウントを一括追加
researchRouter.post("/genres/:id/accounts/bulk", async (c) => {
  const genreId = c.req.param("id");
  const genre = await db.query.adultGenres.findFirst({ where: eq(adultGenres.id, genreId) });
  if (!genre) return c.json({ error: "Genre not found" }, 404);

  const body = await c.req.json<{ usernames: string[]; platform?: string }>();
  if (!Array.isArray(body.usernames) || body.usernames.length === 0) {
    return c.json({ error: "usernames (array) is required" }, 400);
  }

  const platform = body.platform ?? "threads";
  const normalized = [
    ...new Set(
      body.usernames
        .map((u) => (typeof u === "string" ? u.trim().replace(/^@/, "") : ""))
        .filter((u) => u.length > 0 && u.length <= 100),
    ),
  ];
  if (normalized.length === 0) return c.json({ error: "no valid usernames" }, 400);

  // 既存アカウントを除外
  const existing = await db.query.referenceAccounts.findMany({
    where: and(
      eq(referenceAccounts.genreId, genreId),
      inArray(referenceAccounts.username, normalized),
    ),
    columns: { username: true },
  });
  const existingSet = new Set(existing.map((a) => a.username));
  const toInsert = normalized.filter((u) => !existingSet.has(u));

  if (toInsert.length === 0) {
    return c.json({ added: [], skipped: normalized, message: "all usernames already exist" });
  }

  const inserted = await db
    .insert(referenceAccounts)
    .values(toInsert.map((username) => ({ genreId, username, platform })))
    .returning();

  return c.json({
    added: inserted,
    skipped: normalized.filter((u) => existingSet.has(u)),
  }, 201);
});

// PATCH /api/research/genres/:id — グループのメタ情報（name/description/buzzThresholds）を更新
researchRouter.patch("/genres/:id", async (c) => {
  const genreId = c.req.param("id");
  const genre = await db.query.adultGenres.findFirst({ where: eq(adultGenres.id, genreId) });
  if (!genre) return c.json({ error: "Genre not found" }, 404);

  const body = await c.req.json<{
    name?: string;
    description?: string | null;
    buzzThresholds?: {
      minLikes?: number;
      minViews?: number;
      minReplies?: number;
      minReposts?: number;
    };
  }>();

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim() !== "") patch.name = body.name.trim();
  if (body.description !== undefined) patch.description = body.description;
  if (body.buzzThresholds && typeof body.buzzThresholds === "object") {
    const t = body.buzzThresholds;
    const sanitize = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
    patch.buzzThresholds = {
      minLikes: sanitize(t.minLikes ?? genre.buzzThresholds?.minLikes),
      minViews: sanitize(t.minViews ?? genre.buzzThresholds?.minViews),
      minReplies: sanitize(t.minReplies ?? genre.buzzThresholds?.minReplies),
      minReposts: sanitize(t.minReposts ?? genre.buzzThresholds?.minReposts),
    };
  }

  if (Object.keys(patch).length === 0) return c.json(genre);

  const [updated] = await db
    .update(adultGenres)
    .set(patch)
    .where(eq(adultGenres.id, genreId))
    .returning();

  return c.json(updated);
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
//   body: { limit?, postDelayMs?, filter?: { min/maxLikes/Replies/Views/Reposts, applyBuzzThreshold } }
researchRouter.post("/genres/:id/monitor", async (c) => {
  const genreId = c.req.param("id");
  const genre = await db.query.adultGenres.findFirst({ where: eq(adultGenres.id, genreId) });
  if (!genre) return c.json({ error: "Genre not found" }, 404);

  type FilterBody = {
    minLikes?: number; maxLikes?: number;
    minReplies?: number; maxReplies?: number;
    minViews?: number; maxViews?: number;
    minReposts?: number; maxReposts?: number;
    applyBuzzThreshold?: boolean;
  };
  let body: { limit?: number; postDelayMs?: [number, number]; filter?: FilterBody } = {};
  try { body = await c.req.json(); } catch { /* body may be empty */ }

  const limit = typeof body.limit === "number" && Number.isFinite(body.limit) && body.limit > 0
    ? Math.min(Math.floor(body.limit), 200)
    : 30;

  const sanitizeNum = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined;
  const filter: FilterBody | undefined = body.filter
    ? {
        minLikes: sanitizeNum(body.filter.minLikes),
        maxLikes: sanitizeNum(body.filter.maxLikes),
        minReplies: sanitizeNum(body.filter.minReplies),
        maxReplies: sanitizeNum(body.filter.maxReplies),
        minViews: sanitizeNum(body.filter.minViews),
        maxViews: sanitizeNum(body.filter.maxViews),
        minReposts: sanitizeNum(body.filter.minReposts),
        maxReposts: sanitizeNum(body.filter.maxReposts),
        applyBuzzThreshold: body.filter.applyBuzzThreshold === true,
      }
    : undefined;

  const job = await monitorAccountsQueue.add("monitor-accounts", {
    genreId,
    limit,
    postDelayMs: body.postDelayMs,
    filter,
  });
  return c.json({ jobId: job.id, status: "queued", limit }, 202);
});

// GET /api/research/monitor-jobs/:jobId — 監視ジョブの進捗状態を取得
researchRouter.get("/monitor-jobs/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const job = await monitorAccountsQueue.getJob(jobId);
  if (!job) return c.json({ error: "job not found" }, 404);
  const state = await job.getState().catch(() => "unknown");
  return c.json({
    id: job.id,
    state,
    progress: job.progress,
    data: job.data,
    failedReason: job.failedReason ?? null,
    returnvalue: job.returnvalue ?? null,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn ?? null,
  });
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

// ============================================================
// リサーチ → 自動投稿フロー (task_057)
// ============================================================

// GET /api/research/genres/:id/auto-post/preview
//   monitored_posts を viewCount DESC で並べ、UI のプレビュー表示用に返す。
//   - query: maxPosts (1-100, default 10)
researchRouter.get("/genres/:id/auto-post/preview", async (c) => {
  const genreId = c.req.param("id");

  const genre = await db.query.adultGenres.findFirst({ where: eq(adultGenres.id, genreId) });
  if (!genre) return c.json({ error: "グループが見つかりません" }, 404);

  const maxPostsRaw = parseInt(c.req.query("maxPosts") ?? "10");
  const maxPosts = Number.isFinite(maxPostsRaw)
    ? Math.min(Math.max(Math.floor(maxPostsRaw), 1), 100)
    : 10;

  const rows = await db
    .select({
      id: monitoredPosts.id,
      contentText: monitoredPosts.contentText,
      viewCount: monitoredPosts.viewCount,
      likeCount: monitoredPosts.likeCount,
      replyCount: monitoredPosts.replyCount,
      repostCount: monitoredPosts.repostCount,
      buzzScore: monitoredPosts.buzzScore,
      imageUrls: monitoredPosts.imageUrls,
      postedAt: monitoredPosts.postedAt,
      username: referenceAccounts.username,
    })
    .from(monitoredPosts)
    .leftJoin(
      referenceAccounts,
      eq(monitoredPosts.referenceAccountId, referenceAccounts.id),
    )
    .where(eq(monitoredPosts.genreId, genreId))
    .orderBy(desc(monitoredPosts.viewCount))
    .limit(maxPosts);

  return c.json(rows);
});

// POST /api/research/genres/:id/auto-post
//   インプレッション順上位 maxPosts 件を、指定した Threads アカウント全件に対して
//   intervalMinutes 間隔で予約投稿として登録する。
//   重複防止: posts.metadata.monitored_post_id × accountId が既存ならスキップ。
researchRouter.post("/genres/:id/auto-post", async (c) => {
  const genreId = c.req.param("id");

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "リクエストの形式が不正です（JSONパース失敗）" }, 400);
  }

  const accountIds: string[] = Array.isArray(body.accountIds)
    ? body.accountIds.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  if (accountIds.length === 0) {
    return c.json({ error: "accountIds は必須です（1件以上）" }, 400);
  }

  const intervalMinutes =
    typeof body.intervalMinutes === "number" && Number.isFinite(body.intervalMinutes)
      ? Math.floor(body.intervalMinutes)
      : NaN;
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
    return c.json({ error: "intervalMinutes は 1〜1440 の整数で指定してください" }, 400);
  }

  const maxPosts =
    typeof body.maxPosts === "number" && Number.isFinite(body.maxPosts)
      ? Math.floor(body.maxPosts)
      : NaN;
  if (!Number.isFinite(maxPosts) || maxPosts < 1 || maxPosts > 100) {
    return c.json({ error: "maxPosts は 1〜100 の整数で指定してください" }, 400);
  }

  // ジャンル存在チェック
  const genre = await db.query.adultGenres.findFirst({ where: eq(adultGenres.id, genreId) });
  if (!genre) return c.json({ error: "グループが見つかりません" }, 404);

  // アカウント取得（指定順保持・Threads only・active のみ）
  const accountsRaw = await db.query.accounts.findMany({
    where: inArray(accounts.id, accountIds),
  });
  const accountById = new Map(accountsRaw.map((a) => [a.id, a]));
  const targetAccounts: typeof accountsRaw = [];
  for (const id of accountIds) {
    const a = accountById.get(id);
    if (!a) return c.json({ error: `投稿アカウントが見つかりません: ${id}` }, 404);
    if (a.platform !== "threads") {
      return c.json(
        { error: `@${a.username} は Threads アカウントではありません（${a.platform}）` },
        400,
      );
    }
    targetAccounts.push(a);
  }

  // 上位 maxPosts 件を viewCount DESC で取得
  const topPosts = await db
    .select()
    .from(monitoredPosts)
    .where(eq(monitoredPosts.genreId, genreId))
    .orderBy(desc(monitoredPosts.viewCount))
    .limit(maxPosts);

  if (topPosts.length === 0) {
    return c.json({ error: "対象となる監視投稿がありません" }, 400);
  }

  // 既存の (accountId, monitored_post_id) 組み合わせを取得して重複を除外
  const monitoredPostIds = topPosts.map((p) => p.id);
  const existingDup = await db.execute(sql`
    SELECT account_id, metadata->>'monitored_post_id' AS monitored_post_id
    FROM posts
    WHERE account_id IN (${sql.join(targetAccounts.map((a) => sql`${a.id}`), sql`, `)})
      AND metadata->>'source' = 'research_auto_post'
      AND metadata->>'monitored_post_id' IN (${sql.join(monitoredPostIds.map((id) => sql`${id}`), sql`, `)})
  `);
  const dupKey = (accountId: string, monitoredPostId: string) => `${accountId}::${monitoredPostId}`;
  const existingSet = new Set(
    (existingDup as unknown as Array<{ account_id: string; monitored_post_id: string }>).map((r) =>
      dupKey(r.account_id, r.monitored_post_id),
    ),
  );

  const startAt = Date.now();
  const created: Array<{
    postId: string;
    scheduledAt: string;
    accountUsername: string;
    contentPreview: string;
  }> = [];
  const skipped: Array<{ accountId: string; monitoredPostId: string; reason: string }> = [];

  let postIndex = 0;
  for (const mp of topPosts) {
    for (const acc of targetAccounts) {
      if (existingSet.has(dupKey(acc.id, mp.id))) {
        skipped.push({ accountId: acc.id, monitoredPostId: mp.id, reason: "duplicate" });
        continue;
      }

      const scheduledAt = new Date(startAt + postIndex * intervalMinutes * 60 * 1000);

      const [createdPost] = await db
        .insert(posts)
        .values({
          accountId: acc.id,
          platform: "threads",
          contentText: mp.contentText,
          status: "scheduled",
          metadata: {
            source: "research_auto_post",
            monitored_post_id: mp.id,
            genreId,
            viewCount: mp.viewCount,
            likeCount: mp.likeCount,
            imageUrls: mp.imageUrls ?? [],
          },
        })
        .returning({ id: posts.id });

      await db
        .insert(scheduledPosts)
        .values({ postId: createdPost.id, scheduledAt, status: "pending" });

      created.push({
        postId: createdPost.id,
        scheduledAt: scheduledAt.toISOString(),
        accountUsername: acc.username,
        contentPreview: mp.contentText.slice(0, 80),
      });
      postIndex++;
    }
  }

  return c.json(
    {
      scheduledCount: created.length,
      skippedCount: skipped.length,
      posts: created,
      skipped,
    },
    201,
  );
});
