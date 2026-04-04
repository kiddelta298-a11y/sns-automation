import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "../db/client.js";
import { redirectLinks, clickEvents } from "../db/schema.js";

export const redirectorRouter = new Hono();

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

// GET /r/:shortCode — リダイレクタ（クリック計測 → 302リダイレクト）
redirectorRouter.get("/:shortCode", async (c) => {
  const shortCode = c.req.param("shortCode");

  const link = await db.query.redirectLinks.findFirst({
    where: eq(redirectLinks.shortCode, shortCode),
  });

  if (!link) {
    return c.json({ error: "Link not found" }, 404);
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
