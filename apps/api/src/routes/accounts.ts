import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts, posts, postMetrics } from "../db/schema.js";
import {
  createAccountSchema,
  updateAccountSchema,
  updateProxySchema,
  updateAffiliateSchema,
  uploadSessionSchema,
  paginationSchema,
} from "../lib/validators.js";
import { notFound } from "../lib/errors.js";

// ---------------------------------------------------------------
// 返却整形ヘルパー
// ---------------------------------------------------------------
/**
 * DBのアカウント行を UI に返す形に整える。
 *  - `credentials` は機密なので丸ごと除去
 *  - ただし「ログイン済みセッションがあるか」だけは `hasSession` として公開
 *  - `proxyConfig` は含めるが、password はマスクする
 */
function sanitizeAccount(row: {
  id: string;
  platform: string;
  username: string;
  displayName: string | null;
  credentials: unknown;
  proxyConfig: unknown;
  status: string;
  affiliateUrl?: string | null;
  affiliateLabel?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const creds = (row.credentials ?? {}) as Record<string, unknown>;
  const hasSession = !!creds.storageState && typeof creds.storageState === "object";

  let proxy: {
    server: string;
    username?: string;
    password?: string;
    label?: string;
  } | null = null;
  if (row.proxyConfig && typeof row.proxyConfig === "object") {
    const p = row.proxyConfig as Record<string, unknown>;
    if (typeof p.server === "string" && p.server.length > 0) {
      proxy = {
        server: p.server,
        username: typeof p.username === "string" ? p.username : undefined,
        password: typeof p.password === "string" && p.password.length > 0 ? "••••••" : undefined,
        label: typeof p.label === "string" ? p.label : undefined,
      };
    }
  }

  return {
    id: row.id,
    platform: row.platform,
    username: row.username,
    displayName: row.displayName,
    status: row.status,
    hasSession,
    proxyConfig: proxy,
    affiliateUrl: row.affiliateUrl ?? null,
    affiliateLabel: row.affiliateLabel ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const accountsRouter = new Hono();

// POST /api/accounts — アカウント作成
accountsRouter.post("/", zValidator("json", createAccountSchema), async (c) => {
  const data = c.req.valid("json");
  const [account] = await db.insert(accounts).values(data).returning();
  return c.json(sanitizeAccount(account), 201);
});

// GET /api/accounts — アカウント一覧
accountsRouter.get("/", zValidator("query", paginationSchema), async (c) => {
  const { limit, offset } = c.req.valid("query");
  const results = await db.query.accounts.findMany({
    limit,
    offset,
    orderBy: (accounts, { desc }) => [desc(accounts.createdAt)],
  });
  return c.json(results.map(sanitizeAccount));
});

// GET /api/accounts/:id — アカウント詳細
accountsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
    with: { accountMetrics: true },
  });
  if (!account) throw notFound("Account not found");
  return c.json(sanitizeAccount(account));
});

// PUT /api/accounts/:id — アカウント更新
accountsRouter.put("/:id", zValidator("json", updateAccountSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");
  const [updated] = await db
    .update(accounts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();
  if (!updated) throw notFound("Account not found");
  return c.json(sanitizeAccount(updated));
});

// PUT /api/accounts/:id/affiliate — アフィリエイトリンク設定のみ更新
accountsRouter.put("/:id/affiliate", zValidator("json", updateAffiliateSchema), async (c) => {
  const id = c.req.param("id");
  const { affiliateUrl, affiliateLabel } = c.req.valid("json");
  const [updated] = await db
    .update(accounts)
    .set({ affiliateUrl, affiliateLabel, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();
  if (!updated) throw notFound("Account not found");
  return c.json(sanitizeAccount(updated));
});

// PUT /api/accounts/:id/proxy — プロキシ設定のみ更新（null で解除）
accountsRouter.put("/:id/proxy", zValidator("json", updateProxySchema), async (c) => {
  const id = c.req.param("id");
  const { proxyConfig } = c.req.valid("json");

  const [updated] = await db
    .update(accounts)
    .set({ proxyConfig: proxyConfig ?? null, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();
  if (!updated) throw notFound("Account not found");
  return c.json(sanitizeAccount(updated));
});

// POST /api/accounts/:id/proxy/test — プロキシ経由で外部IPを返す（接続確認用）
// undici の ProxyAgent を使って api.ipify.org を叩くだけの軽量テスト。
// ブラウザを起動しないので worker ではなく API 直実行でOK。
accountsRouter.post("/:id/proxy/test", async (c) => {
  const id = c.req.param("id");
  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, id) });
  if (!account) throw notFound("Account not found");

  const proxy = account.proxyConfig as {
    server?: string;
    username?: string;
    password?: string;
  } | null;

  if (!proxy?.server) {
    return c.json({ ok: false, error: "プロキシが設定されていません" }, 400);
  }

  try {
    const { ProxyAgent, request } = await import("undici");

    // user/pass がある場合は URL に埋め込む (undici ProxyAgent の作法)
    let proxyUri = proxy.server;
    if (proxy.username) {
      const u = new URL(proxy.server);
      u.username = encodeURIComponent(proxy.username);
      if (proxy.password) u.password = encodeURIComponent(proxy.password);
      proxyUri = u.toString();
    }

    const dispatcher = new ProxyAgent({ uri: proxyUri });
    const { body, statusCode } = await request("https://api.ipify.org?format=json", {
      dispatcher,
      headersTimeout: 15_000,
      bodyTimeout: 15_000,
    });
    if (statusCode !== 200) {
      return c.json({ ok: false, error: `ipify status=${statusCode}` }, 500);
    }
    const text = await body.text();
    let ip: string | null = null;
    try {
      const parsed = JSON.parse(text) as { ip?: unknown };
      ip = typeof parsed.ip === "string" ? parsed.ip : null;
    } catch {
      // ignore
    }
    if (!ip) return c.json({ ok: false, error: "IPアドレスの取得に失敗しました" }, 500);
    return c.json({ ok: true, ip });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: `プロキシ接続に失敗: ${msg}` }, 500);
  }
});

// POST /api/accounts/:id/session — x-login.ts が吐いた storageState をアップロード
accountsRouter.post("/:id/session", zValidator("json", uploadSessionSchema), async (c) => {
  const id = c.req.param("id");
  const { storageState } = c.req.valid("json");

  const existing = await db.query.accounts.findFirst({ where: eq(accounts.id, id) });
  if (!existing) throw notFound("Account not found");

  const currentCreds = (existing.credentials ?? {}) as Record<string, unknown>;
  const newCreds = { ...currentCreds, storageState };

  const [updated] = await db
    .update(accounts)
    .set({ credentials: newCreds, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();
  if (!updated) throw notFound("Account not found");

  return c.json({ ok: true, account: sanitizeAccount(updated) });
});

// DELETE /api/accounts/:id/session — 保存済みセッションを破棄
accountsRouter.delete("/:id/session", async (c) => {
  const id = c.req.param("id");
  const existing = await db.query.accounts.findFirst({ where: eq(accounts.id, id) });
  if (!existing) throw notFound("Account not found");

  const currentCreds = (existing.credentials ?? {}) as Record<string, unknown>;
  const { storageState: _drop, ...rest } = currentCreds;
  void _drop;

  const [updated] = await db
    .update(accounts)
    .set({ credentials: rest, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();
  if (!updated) throw notFound("Account not found");
  return c.json({ ok: true, account: sanitizeAccount(updated) });
});

// DELETE /api/accounts/:id — アカウント削除
accountsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [deleted] = await db.delete(accounts).where(eq(accounts.id, id)).returning();
  if (!deleted) throw notFound("Account not found");
  return c.json({ success: true });
});

// GET /api/accounts/:id/metrics — アカウント別パフォーマンス集計
accountsRouter.get("/:id/metrics", async (c) => {
  const accountId = c.req.param("id");

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });
  if (!account) throw notFound("Account not found");
  const { credentials, ...accountSafe } = account;

  // 投稿集計: ステータス別件数
  const postStats = await db.execute(sql`
    SELECT
      status,
      COUNT(*) AS count
    FROM posts
    WHERE account_id = ${accountId}
    GROUP BY status
  `);

  // メトリクス集計: 直近30日
  const metricStats = await db.execute(sql`
    SELECT
      COALESCE(SUM(pm.likes), 0)          AS total_likes,
      COALESCE(SUM(pm.reposts), 0)        AS total_reposts,
      COALESCE(SUM(pm.replies), 0)        AS total_replies,
      COALESCE(SUM(pm.views), 0)          AS total_views,
      COALESCE(AVG(pm.likes), 0)          AS avg_likes,
      COALESCE(AVG(pm.views), 0)          AS avg_views,
      COUNT(DISTINCT p.id)                AS posts_with_metrics
    FROM post_metrics pm
    JOIN posts p ON p.id = pm.post_id
    WHERE p.account_id = ${accountId}
      AND pm.collected_at >= NOW() - INTERVAL '30 days'
  `);

  // 直近10件の投稿
  const recentPosts = await db.query.posts.findMany({
    where: eq(posts.accountId, accountId),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
    limit: 10,
    with: { postMetrics: { limit: 1, orderBy: (m, { desc }) => [desc(m.collectedAt)] } },
  });

  return c.json({
    account: accountSafe,
    postStats: postStats as unknown as { status: string; count: string }[],
    metrics: metricStats[0] ?? {},
    recentPosts,
  });
});
