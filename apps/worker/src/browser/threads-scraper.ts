import { BrowserSession, humanDelay, type BrowserSessionOptions } from "./base.js";
import type { Page } from "playwright";

export interface ScrapedPost {
  authorUsername: string | null;
  authorFollowers: number | null;
  contentText: string;
  hasImage: boolean;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  viewCount: number;
  postedAt: Date | null;
}

// ============================================================
// Threads スクレイパー
// ============================================================
export class ThreadsScraper {
  private session: BrowserSession;

  constructor(sessionOpts?: Partial<BrowserSessionOptions>) {
    this.session = new BrowserSession({
      sessionKey: "threads_scraper",
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

  /** キーワード検索でバズ投稿を収集 */
  async scrapeByKeyword(keyword: string, maxPosts = 50): Promise<ScrapedPost[]> {
    const page = this.session.page;
    const posts: ScrapedPost[] = [];

    try {
      const encodedKeyword = encodeURIComponent(keyword);
      await page.goto(`https://www.threads.com/search?q=${encodedKeyword}&serp_type=default`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      await humanDelay(2000, 4000);

      posts.push(...await this._extractPostsFromPage(page, maxPosts));

      // スクロールして追加投稿を取得
      let prevCount = 0;
      let scrollAttempts = 0;
      while (posts.length < maxPosts && scrollAttempts < 15) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await humanDelay(1500, 3000);
        const newPosts = await this._extractPostsFromPage(page, maxPosts - posts.length);
        const uniqueNew = newPosts.filter(np =>
          !posts.some(p => p.contentText === np.contentText),
        );
        posts.push(...uniqueNew);
        if (posts.length === prevCount) scrollAttempts++;
        else scrollAttempts = 0;
        prevCount = posts.length;
      }
    } catch (err) {
      console.warn(`[scraper] keyword=${keyword} error:`, err);
    }

    return posts.slice(0, maxPosts);
  }

  /** おすすめフィード（ログイン不要のFor You）から収集 */
  async scrapeForYouFeed(maxPosts = 100): Promise<ScrapedPost[]> {
    const page = this.session.page;
    const posts: ScrapedPost[] = [];

    try {
      await page.goto("https://www.threads.com/", {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      await humanDelay(2000, 4000);

      posts.push(...await this._extractPostsFromPage(page, maxPosts));

      let prevCount = 0;
      let scrollAttempts = 0;
      while (posts.length < maxPosts && scrollAttempts < 20) {
        await page.evaluate(() => window.scrollBy(0, 1000));
        await humanDelay(1000, 2500);
        const newPosts = await this._extractPostsFromPage(page, maxPosts - posts.length);
        const uniqueNew = newPosts.filter(np =>
          !posts.some(p => p.contentText === np.contentText),
        );
        posts.push(...uniqueNew);
        if (posts.length === prevCount) scrollAttempts++;
        else scrollAttempts = 0;
        prevCount = posts.length;
      }
    } catch (err) {
      console.warn("[scraper] forYouFeed error:", err);
    }

    return posts.slice(0, maxPosts);
  }

  /** ページからDOM解析で投稿一覧を抽出 */
  private async _extractPostsFromPage(page: Page, limit: number): Promise<ScrapedPost[]> {
    const raw = await page.evaluate((limit) => {
      const results: {
        authorUsername: string | null;
        authorFollowers: number | null;
        contentText: string;
        hasImage: boolean;
        likeCount: number;
        repostCount: number;
        replyCount: number;
        viewCount: number;
        postedAt: string | null;
      }[] = [];

      // Threads のDOM構造は頻繁に変わるため、汎用的なセレクタで取得
      const postContainers = document.querySelectorAll(
        "article, [data-pressable-container], div[role='article']",
      );

      for (const container of postContainers) {
        if (results.length >= limit) break;

        // テキスト取得
        const textEl = container.querySelector(
          "[data-text-content], [class*='postText'], span[dir]",
        );
        const contentText = textEl?.textContent?.trim() ?? "";
        if (!contentText || contentText.length < 5) continue;

        // ユーザー名
        const usernameEl = container.querySelector("a[href*='/@']");
        const authorUsername = usernameEl
          ? usernameEl.getAttribute("href")?.replace("/@", "").replace("/", "") ?? null
          : null;

        // 画像があるか
        const hasImage = !!container.querySelector("img[src*='cdninstagram'], img[src*='fbcdn']");

        // エンゲージメント数の解析
        const parseCount = (text: string): number => {
          const cleaned = text.replace(/[,，]/g, "").trim();
          if (!cleaned || cleaned === "") return 0;
          const m = cleaned.match(/([\d.]+)\s*([KkMm万千]?)/);
          if (!m) return 0;
          const num = parseFloat(m[1]);
          const unit = m[2].toLowerCase();
          if (unit === "k") return Math.round(num * 1000);
          if (unit === "m") return Math.round(num * 1_000_000);
          if (unit === "万") return Math.round(num * 10_000);
          if (unit === "千") return Math.round(num * 1_000);
          return Math.round(num);
        };

        // いいね・リポスト・リプライを取得
        const buttons = container.querySelectorAll("button, [role='button']");
        let likeCount = 0;
        let repostCount = 0;
        let replyCount = 0;
        let viewCount = 0;

        for (const btn of buttons) {
          const ariaLabel = (btn.getAttribute("aria-label") ?? "").toLowerCase();
          const text = btn.textContent ?? "";
          if (ariaLabel.includes("いいね") || ariaLabel.includes("like")) {
            likeCount = parseCount(text);
          } else if (ariaLabel.includes("リポスト") || ariaLabel.includes("repost") || ariaLabel.includes("rethread")) {
            repostCount = parseCount(text);
          } else if (ariaLabel.includes("返信") || ariaLabel.includes("reply")) {
            replyCount = parseCount(text);
          } else if (ariaLabel.includes("表示") || ariaLabel.includes("view")) {
            viewCount = parseCount(text);
          }
        }

        // 投稿時刻
        const timeEl = container.querySelector("time");
        const postedAt = timeEl?.getAttribute("datetime") ?? null;

        results.push({
          authorUsername,
          authorFollowers: null, // フォロワー数は個別ページ取得が必要なためnull
          contentText,
          hasImage,
          likeCount,
          repostCount,
          replyCount,
          viewCount,
          postedAt,
        });
      }

      return results;
    }, limit);

    // page.evaluate はブラウザコンテキストで動くため Date を返せない
    // 文字列を Date に変換して ScrapedPost 型に合わせる
    return raw.map((r) => ({
      ...r,
      postedAt: r.postedAt ? new Date(r.postedAt) : null,
    }));
  }
}

// ============================================================
// バズスコア計算
// ============================================================
export function calcBuzzScore(post: ScrapedPost): { buzzScore: number; engagementRate: number } {
  const followers = post.authorFollowers ?? 1000; // 不明の場合は1000と仮定
  const rawEngagement = post.likeCount * 1 + post.repostCount * 3 + post.replyCount * 2;

  // 時間減衰（投稿から何時間経過したか）
  let timeDecay = 1.0;
  if (post.postedAt) {
    const hoursAgo = (Date.now() - post.postedAt.getTime()) / (1000 * 60 * 60);
    timeDecay = Math.exp(-0.03 * hoursAgo); // 24h後で約50%
  }

  const engagementRate = followers > 0 ? rawEngagement / followers : 0;
  const buzzScore = engagementRate * timeDecay;

  return {
    buzzScore: Math.round(buzzScore * 10000) / 10000,
    engagementRate: Math.round(engagementRate * 10000) / 10000,
  };
}

// ============================================================
// 投稿フォーマット分類（テキスト解析）
// ============================================================
export function classifyPostFormat(text: string): string {
  const t = text.trim();

  // 問いかけ型: 文末に？や「思いますか」「どう？」
  if (/[？?]/.test(t) && (/思いますか|どう(ですか|思う)?|あなた|皆さん/.test(t) || t.endsWith("？") || t.endsWith("?"))) {
    return "question";
  }

  // リスト型: 番号付きや箇条書き
  if (/^[①②③④⑤1-9]\.|[\n][ \t]*[・•\-●◆▶→]/m.test(t) || /\n[1-9]\./m.test(t)) {
    return "list";
  }

  // 体験談型: 「〜した」「私は」「実は」「昨日」「先日」
  if (/私は|僕は|実は|昨日|先日|〜した|ました。|でした。|きました|ていた/.test(t)) {
    return "story";
  }

  // オチ型: 文末に「笑」「w」や「落ち」のある短めの投稿
  if ((t.length < 100) && /笑|ｗ+|www|（笑）|\(笑\)|だよね。|だな。|わかる。/.test(t)) {
    return "punchline";
  }

  // 主張型: 断言調や「べき」「ほうがいい」
  if (/べき|ほうがいい|大事|重要|必要|絶対|間違い|真実|本質/.test(t)) {
    return "opinion";
  }

  return "other";
}
