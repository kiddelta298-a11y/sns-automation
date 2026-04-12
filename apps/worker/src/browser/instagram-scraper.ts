import { BrowserSession, humanDelay, type BrowserSessionOptions } from "./base.js";
import type { Page } from "playwright";
import type { ScrapedPost } from "./threads-scraper.js";

// ============================================================
// Instagram スクレイパー（ハッシュタグ・Explore）
// ============================================================
export class InstagramScraper {
  private session: BrowserSession;

  constructor(sessionOpts?: Partial<BrowserSessionOptions>) {
    this.session = new BrowserSession({
      sessionKey: "instagram_scraper",
      headless: true,
      ...sessionOpts,
    });
  }

  async init(): Promise<void> {
    await this.session.init();
  }

  async close(): Promise<void> {
    await this.session.close();
  }

  /**
   * ログイン（Explore/タグページ取得のため必要）
   */
  async login(username: string, password: string): Promise<boolean> {
    const page = this.session.page;
    try {
      await page.goto("https://www.instagram.com/accounts/login/", {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      await humanDelay(1500, 3000);

      await page.fill('input[name="username"]', username);
      await page.fill('input[name="password"]', password);
      await humanDelay(800, 1500);
      await page.click('button[type="submit"]');

      // ログイン成功を待つ
      await page.waitForURL(
        (url) => !url.href.includes("/accounts/login/"),
        { timeout: 15_000 },
      ).catch(() => null);

      // 通知・保存ダイアログを閉じる
      for (const text of ["後で", "Not Now", "Not now"]) {
        const btn = page.locator(`button:has-text("${text}")`).first();
        if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await btn.click();
          await humanDelay(500, 1000);
        }
      }

      return !page.url().includes("/accounts/login/");
    } catch (err) {
      console.warn("[instagram-scraper] login error:", err);
      return false;
    }
  }

  /**
   * ハッシュタグ検索でバズ投稿を収集
   */
  async scrapeByHashtag(hashtag: string, maxPosts = 50): Promise<ScrapedPost[]> {
    const page = this.session.page;
    const posts: ScrapedPost[] = [];

    try {
      const tag = hashtag.replace(/^#/, "");
      await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      await humanDelay(2000, 4000);

      // ポスト一覧ページから各投稿リンクを収集
      const postLinks = await page.evaluate(() => {
        const anchors = document.querySelectorAll("a[href*='/p/']");
        const hrefs = new Set<string>();
        for (const a of anchors) {
          const href = a.getAttribute("href");
          if (href?.match(/^\/p\/[A-Za-z0-9_-]+\//)) hrefs.add(href);
        }
        return Array.from(hrefs).slice(0, 20);
      });

      console.log(`[instagram-scraper] hashtag=${hashtag} found ${postLinks.length} links`);

      for (const href of postLinks) {
        if (posts.length >= maxPosts) break;
        const post = await this._scrapePostDetail(page, `https://www.instagram.com${href}`);
        if (post) posts.push(post);
        await humanDelay(1000, 2500);
      }
    } catch (err) {
      console.warn(`[instagram-scraper] hashtag=${hashtag} error:`, err);
    }

    return posts;
  }

  /**
   * Explore（おすすめ）フィードから収集
   */
  async scrapeExploreFeed(maxPosts = 50): Promise<ScrapedPost[]> {
    const page = this.session.page;
    const posts: ScrapedPost[] = [];

    try {
      await page.goto("https://www.instagram.com/explore/", {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      await humanDelay(2000, 4000);

      // Explore グリッドから投稿リンク収集
      let prevCount = 0;
      let scrollAttempts = 0;

      while (posts.length < maxPosts && scrollAttempts < 8) {
        const postLinks = await page.evaluate(() => {
          const anchors = document.querySelectorAll("a[href*='/p/']");
          const hrefs = new Set<string>();
          for (const a of anchors) {
            const href = a.getAttribute("href");
            if (href?.match(/^\/p\/[A-Za-z0-9_-]+\//)) hrefs.add(href);
          }
          return Array.from(hrefs);
        });

        for (const href of postLinks) {
          if (posts.length >= maxPosts) break;
          if (posts.some(p => p.authorUsername && href.includes(p.authorUsername))) continue;

          const post = await this._scrapePostDetail(page, `https://www.instagram.com${href}`);
          if (post && !posts.some(p => p.contentText === post.contentText)) {
            posts.push(post);
          }
          await humanDelay(800, 2000);
        }

        if (posts.length === prevCount) {
          scrollAttempts++;
          await page.evaluate(() => window.scrollBy(0, 1000));
          await humanDelay(1500, 3000);
        } else {
          scrollAttempts = 0;
        }
        prevCount = posts.length;
      }
    } catch (err) {
      console.warn("[instagram-scraper] explore error:", err);
    }

    return posts.slice(0, maxPosts);
  }

  /**
   * 個別投稿ページからデータを取得
   */
  private async _scrapePostDetail(page: Page, url: string): Promise<ScrapedPost | null> {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await humanDelay(800, 1500);

      const data = await page.evaluate(() => {
        const parseCount = (text: string): number => {
          const cleaned = text.replace(/[,，\s]/g, "");
          if (!cleaned) return 0;
          const m = cleaned.match(/([\d.]+)([KkMm万千]?)/);
          if (!m) return 0;
          const num = parseFloat(m[1]);
          const unit = m[2].toLowerCase();
          if (unit === "k") return Math.round(num * 1000);
          if (unit === "m") return Math.round(num * 1_000_000);
          if (unit === "万") return Math.round(num * 10_000);
          if (unit === "千") return Math.round(num * 1_000);
          return Math.round(num);
        };

        // キャプション取得
        const captionEl = document.querySelector(
          "h1[class], ._a9zs, div[class*='caption'], article div[class*='x1lliihq']",
        );
        const contentText = captionEl?.textContent?.trim() ?? "";

        // ユーザー名
        const usernameEl = document.querySelector("a[href*='/'][class*='x1lliihq'], header a");
        const authorUsername = usernameEl
          ? (usernameEl.getAttribute("href") ?? "").replace(/^\//, "").replace(/\/$/, "") || null
          : null;

        // いいね数
        const likeSection = document.querySelector(
          "section[class*='x12nagc'], div[class*='x1xmf6yo']",
        );
        const likeText = likeSection?.textContent ?? "";
        const likeMatch = likeText.match(/(\d[\d,.]*\s*[KkMm万千]?)/);
        const likeCount = likeMatch ? parseCount(likeMatch[1]) : 0;

        // 画像があるか
        const hasImage = !!document.querySelector(
          "article img[src*='cdninstagram'], article img[src*='fbcdn']",
        );

        // 投稿時刻
        const timeEl = document.querySelector("time");
        const postedAt = timeEl?.getAttribute("datetime") ?? null;

        return { authorUsername, contentText, hasImage, likeCount, postedAt };
      });

      if (!data.contentText || data.contentText.length < 5) return null;

      return {
        authorUsername: data.authorUsername,
        authorFollowers: null,
        contentText: data.contentText,
        hasImage: data.hasImage,
        imageUrls: [],
        likeCount: data.likeCount,
        repostCount: 0, // Instagram はリポスト数非公開
        replyCount: 0,
        viewCount: 0,
        postedAt: data.postedAt ? new Date(data.postedAt) : null,
        platformPostId: url, // Instagram投稿URLをIDとして使用
      };
    } catch (err) {
      console.warn(`[instagram-scraper] post detail error (${url}):`, err);
      return null;
    }
  }
}
