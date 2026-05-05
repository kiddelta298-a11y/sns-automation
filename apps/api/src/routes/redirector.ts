import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "../db/client.js";
import { redirectLinks, clickEvents, affiliateLinks, linkClicks } from "../db/schema.js";

export const redirectorRouter = new Hono();

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

// GET /r/:shortCode — リダイレクタ（クリック計測 → 302リダイレクト）
//   1) 既存の redirect_links を検索
//   2) ヒットしなければ affiliate_links.short_slug を検索（アフィリエイトPDCA）
redirectorRouter.get("/:shortCode", async (c) => {
  const shortCode = c.req.param("shortCode");

  const link = await db.query.redirectLinks.findFirst({
    where: eq(redirectLinks.shortCode, shortCode),
  });

  if (!link) {
    const aff = await db.query.affiliateLinks.findFirst({
      where: eq(affiliateLinks.shortSlug, shortCode),
    });
    if (!aff) return c.json({ error: "Link not found" }, 404);
    if (aff.status === "dead") return c.json({ error: "Gone" }, 410);

    const clientIp =
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    const userAgent = c.req.header("user-agent") || "";
    const referer = c.req.header("referer") || "";
    const utmSource = c.req.query("utm_source") ?? null;
    const storyPostId = c.req.query("s") ?? null;

    void (async () => {
      try {
        await db.insert(linkClicks).values({
          shortSlug: shortCode,
          ipHash: hashIp(clientIp),
          userAgent: userAgent.slice(0, 500),
          referer: referer.slice(0, 500),
          utmSource: utmSource ?? undefined,
          storyPostId: storyPostId ?? undefined,
        });
      } catch (err) {
        console.error("Failed to record affiliate click:", err);
      }
    })();

    return c.redirect(aff.trackingUrl, 302);
  }

  // クリックイベント記録（非同期、リダイレクトをブロックしない）
  const clientIp = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
  const userAgent = c.req.header("user-agent") || "";
  const referer = c.req.header("referer") || "";

  // 非同期でクリック記録（302応答を遅延させない）
  void (async () => {
    try {
      await db.insert(clickEvents).values({
        redirectLinkId: link.id,
        ipHash: hashIp(clientIp),
        userAgent: userAgent.slice(0, 500),
        referer: referer.slice(0, 500),
      });
      // click_count キャッシュ更新
      await db
        .update(redirectLinks)
        .set({ clickCount: sql`${redirectLinks.clickCount} + 1` })
        .where(eq(redirectLinks.id, link.id));
    } catch (err) {
      console.error("Failed to record click event:", err);
    }
  })();

  return c.redirect(link.destinationUrl, 302);
});
