import { Hono } from "hono";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  affiliateLinks,
  storyPosts,
  linkClicks,
  aspReports,
  accounts,
} from "../db/schema.js";

export const affiliateRouter = new Hono();

// ─── slug 生成（8文字英数字、衝突時リトライ） ────────────────────
const SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
function randomSlug(len = 8): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)];
  }
  return s;
}

async function generateUniqueSlug(maxAttempts = 10): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const slug = randomSlug(8);
    const exists = await db.query.affiliateLinks.findFirst({
      where: eq(affiliateLinks.shortSlug, slug),
    });
    if (!exists) return slug;
  }
  throw new Error("Failed to generate unique slug after multiple attempts");
}

// ============================================================
// affiliate_links（案件マスタ）
// ============================================================

// GET /api/affiliate/links — 一覧（累計クリック・累計CV・累計revenue 集計付き）
//   ?accountId=<uuid> でアカウント別フィルタ
//   ?accountId=null で「未割当（共有）」リンクのみ
affiliateRouter.get("/links", async (c) => {
  const accountIdParam = c.req.query("accountId");
  let whereClause = sql``;
  if (accountIdParam === "null" || accountIdParam === "shared") {
    whereClause = sql`WHERE l.account_id IS NULL`;
  } else if (accountIdParam) {
    whereClause = sql`WHERE l.account_id = ${accountIdParam}`;
  }
  const rows = await db.execute(sql`
    SELECT
      l.*,
      COALESCE(c.click_count, 0)::int AS total_clicks,
      COALESCE(r.cv_total, 0)::int AS total_cv,
      COALESCE(r.revenue_total, 0)::int AS total_revenue
    FROM affiliate_links l
    LEFT JOIN (
      SELECT short_slug, COUNT(*) AS click_count
      FROM link_clicks
      GROUP BY short_slug
    ) c ON c.short_slug = l.short_slug
    LEFT JOIN (
      SELECT link_id, SUM(cv) AS cv_total, SUM(revenue) AS revenue_total
      FROM asp_reports
      GROUP BY link_id
    ) r ON r.link_id = l.id
    ${whereClause}
    ORDER BY l.created_at DESC
  `);
  return c.json(rows);
});

// POST /api/affiliate/links — 新規作成（slug 自動発行）
affiliateRouter.post("/links", async (c) => {
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  const caseName = typeof body.caseName === "string" ? body.caseName.trim() : "";
  const asp = typeof body.asp === "string" ? body.asp.trim() : "";
  const trackingUrl = typeof body.trackingUrl === "string" ? body.trackingUrl.trim() : "";
  if (!caseName) return c.json({ error: "caseName は必須です" }, 400);
  if (!asp) return c.json({ error: "asp は必須です" }, 400);
  if (!trackingUrl) return c.json({ error: "trackingUrl は必須です" }, 400);
  try {
    new URL(trackingUrl);
  } catch {
    return c.json({ error: "trackingUrl は有効なURLではありません" }, 400);
  }

  const genre = typeof body.genre === "string" ? body.genre : null;
  const unitPayout =
    typeof body.unitPayout === "number" && Number.isFinite(body.unitPayout)
      ? Math.floor(body.unitPayout)
      : null;
  const memo = typeof body.memo === "string" ? body.memo : null;
  const accountId = typeof body.accountId === "string" && body.accountId.trim() ? body.accountId.trim() : null;

  // 任意で slug を指定可能。指定されなければ自動発行。
  let shortSlug = typeof body.shortSlug === "string" && body.shortSlug.trim()
    ? body.shortSlug.trim()
    : await generateUniqueSlug();

  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(shortSlug)) {
    return c.json({ error: "shortSlug は3〜32文字の英数字/-/_ で指定してください" }, 400);
  }

  try {
    const [created] = await db
      .insert(affiliateLinks)
      .values({
        accountId: accountId ?? undefined,
        caseName,
        asp,
        trackingUrl,
        shortSlug,
        genre: genre ?? undefined,
        unitPayout: unitPayout ?? undefined,
        memo: memo ?? undefined,
      })
      .returning();
    return c.json(created, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate|unique/i.test(msg)) {
      return c.json({ error: "この shortSlug は既に使用されています" }, 409);
    }
    console.error("[POST /api/affiliate/links] failed:", e);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PATCH /api/affiliate/links/:id — 編集
affiliateRouter.patch("/links/:id", async (c) => {
  const id = c.req.param("id");
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.caseName === "string" && body.caseName.trim()) updates.caseName = body.caseName.trim();
  if (typeof body.asp === "string" && body.asp.trim()) updates.asp = body.asp.trim();
  if (typeof body.trackingUrl === "string" && body.trackingUrl.trim()) {
    try { new URL(body.trackingUrl); } catch { return c.json({ error: "trackingUrl は有効なURLではありません" }, 400); }
    updates.trackingUrl = body.trackingUrl.trim();
  }
  if (typeof body.genre === "string") updates.genre = body.genre;
  if (typeof body.unitPayout === "number" && Number.isFinite(body.unitPayout)) updates.unitPayout = Math.floor(body.unitPayout);
  if (typeof body.status === "string" && ["active", "paused", "dead"].includes(body.status)) updates.status = body.status;
  if (typeof body.memo === "string") updates.memo = body.memo;
  // accountId: 文字列(uuid)で割当 / null で共有化（紐付け解除）
  if (body.accountId === null) updates.accountId = null;
  else if (typeof body.accountId === "string" && body.accountId.trim()) updates.accountId = body.accountId.trim();

  const [updated] = await db
    .update(affiliateLinks)
    .set(updates as never)
    .where(eq(affiliateLinks.id, id))
    .returning();
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

// DELETE /api/affiliate/links/:id — 削除
affiliateRouter.delete("/links/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.delete(affiliateLinks).where(eq(affiliateLinks.id, id)).returning();
  if (result.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ============================================================
// story_posts（ストーリー投稿実績）
// ============================================================

// GET /api/affiliate/posts — 一覧
affiliateRouter.get("/posts", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
  const rows = await db.execute(sql`
    SELECT
      sp.*,
      a.username AS account_username,
      l.case_name AS link_case_name,
      l.short_slug AS link_short_slug,
      l.asp AS link_asp,
      COALESCE(c.click_count, 0)::int AS click_count_via_link
    FROM story_posts sp
    LEFT JOIN accounts a ON a.id = sp.account_id
    LEFT JOIN affiliate_links l ON l.id = sp.link_id
    LEFT JOIN (
      SELECT story_post_id, COUNT(*) AS click_count
      FROM link_clicks
      WHERE story_post_id IS NOT NULL
      GROUP BY story_post_id
    ) c ON c.story_post_id = sp.id
    ORDER BY sp.posted_at DESC
    LIMIT ${limit}
  `);
  return c.json(rows);
});

// POST /api/affiliate/posts — 投稿登録
affiliateRouter.post("/posts", async (c) => {
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  const linkId = typeof body.linkId === "string" ? body.linkId : null;
  const accountId = typeof body.accountId === "string" ? body.accountId : null;
  const caption = typeof body.caption === "string" ? body.caption : null;
  const imagePath = typeof body.imagePath === "string" ? body.imagePath : null;
  const sourceBuzzId = typeof body.sourceBuzzId === "string" ? body.sourceBuzzId : null;
  const note = typeof body.note === "string" ? body.note : null;

  const postedAt = (() => {
    if (typeof body.postedAt === "string" && body.postedAt) {
      const d = new Date(body.postedAt);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  })();
  const expiredAt = new Date(postedAt.getTime() + 24 * 60 * 60 * 1000);

  // FK 整合性チェック
  if (linkId) {
    const exists = await db.query.affiliateLinks.findFirst({ where: eq(affiliateLinks.id, linkId) });
    if (!exists) return c.json({ error: "linkId が見つかりません" }, 404);
  }
  if (accountId) {
    const exists = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) });
    if (!exists) return c.json({ error: "accountId が見つかりません" }, 404);
  }

  const [created] = await db
    .insert(storyPosts)
    .values({
      postedAt,
      accountId: accountId ?? undefined,
      linkId: linkId ?? undefined,
      sourceBuzzId: sourceBuzzId ?? undefined,
      imagePath: imagePath ?? undefined,
      caption: caption ?? undefined,
      note: note ?? undefined,
      expiredAt,
    })
    .returning();
  return c.json(created, 201);
});

// DELETE /api/affiliate/posts/:id
affiliateRouter.delete("/posts/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.delete(storyPosts).where(eq(storyPosts.id, id)).returning();
  if (result.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ============================================================
// dashboard（簡易分析）
// ============================================================

// GET /api/affiliate/dashboard — ROAS テーブル + アカウント別CVR + 時間帯ヒートマップ
affiliateRouter.get("/dashboard", async (c) => {
  const fromQ = c.req.query("from");
  const toQ = c.req.query("to");
  const from = fromQ ? new Date(fromQ + "T00:00:00") : null;
  const to = toQ ? new Date(toQ + "T23:59:59") : null;

  const dateConds: string[] = [];
  if (from) dateConds.push(`>= '${from.toISOString()}'`);
  if (to) dateConds.push(`<= '${to.toISOString()}'`);

  // 案件別 ROAS テーブル
  const linkRoas = await db.execute(sql`
    SELECT
      l.id,
      l.case_name,
      l.asp,
      l.unit_payout,
      COALESCE(c.click_count, 0)::int AS clicks,
      COALESCE(r.cv_total, 0)::int AS cv,
      COALESCE(r.revenue_total, 0)::int AS revenue,
      CASE
        WHEN COALESCE(c.click_count, 0) > 0
        THEN (COALESCE(r.cv_total, 0)::real / c.click_count)
        ELSE 0
      END AS cvr
    FROM affiliate_links l
    LEFT JOIN (
      SELECT short_slug, COUNT(*) AS click_count
      FROM link_clicks
      WHERE 1=1
        ${from ? sql`AND clicked_at >= ${from}` : sql``}
        ${to ? sql`AND clicked_at <= ${to}` : sql``}
      GROUP BY short_slug
    ) c ON c.short_slug = l.short_slug
    LEFT JOIN (
      SELECT link_id, SUM(cv) AS cv_total, SUM(revenue) AS revenue_total
      FROM asp_reports
      WHERE 1=1
        ${from ? sql`AND report_date >= ${from}` : sql``}
        ${to ? sql`AND report_date <= ${to}` : sql``}
      GROUP BY link_id
    ) r ON r.link_id = l.id
    WHERE l.status != 'dead'
    ORDER BY revenue DESC NULLS LAST, clicks DESC NULLS LAST
  `);

  // アカウント別 CVR（story_posts → link_clicks 経由）
  const accountCvr = await db.execute(sql`
    SELECT
      a.id,
      a.username,
      a.platform,
      COUNT(DISTINCT sp.id)::int AS story_count,
      COALESCE(SUM(c.click_count), 0)::int AS clicks,
      COALESCE(SUM(r.cv_total), 0)::int AS cv
    FROM accounts a
    JOIN story_posts sp ON sp.account_id = a.id
      ${from ? sql`AND sp.posted_at >= ${from}` : sql``}
      ${to ? sql`AND sp.posted_at <= ${to}` : sql``}
    LEFT JOIN (
      SELECT story_post_id, COUNT(*) AS click_count
      FROM link_clicks
      WHERE story_post_id IS NOT NULL
      GROUP BY story_post_id
    ) c ON c.story_post_id = sp.id
    LEFT JOIN (
      SELECT link_id, SUM(cv) AS cv_total
      FROM asp_reports
      GROUP BY link_id
    ) r ON r.link_id = sp.link_id
    GROUP BY a.id, a.username, a.platform
    ORDER BY clicks DESC NULLS LAST
  `);

  // 時間帯ヒートマップ（曜日 × 時間帯のクリック密度）
  const heatmap = await db.execute(sql`
    SELECT
      EXTRACT(DOW FROM clicked_at)::int AS dow,
      EXTRACT(HOUR FROM clicked_at)::int AS hour,
      COUNT(*)::int AS clicks
    FROM link_clicks
    WHERE 1=1
      ${from ? sql`AND clicked_at >= ${from}` : sql``}
      ${to ? sql`AND clicked_at <= ${to}` : sql``}
    GROUP BY dow, hour
    ORDER BY dow, hour
  `);

  return c.json({ linkRoas, accountCvr, heatmap });
});
