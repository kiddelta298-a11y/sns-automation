import {
  BrowserSession,
  humanDelay,
  humanScroll,
  type BrowserSessionOptions,
} from "./base.js";
import type { Page } from "playwright";

const BASE_URL = "https://x.com";

export interface XProfile {
  username: string;
  displayName?: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
}

export interface XPost {
  postId: string;
  authorUsername: string;
  contentText: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  viewCount?: number;
  postedAt?: string;
  postUrl: string;
}

/**
 * X のタイムライン・プロフィール取得用スクレイパー
 * ログイン済み storageState が必要（未ログインだと大半のページがログインウォールに遮られる）
 */
export class XScraper {
  private session: BrowserSession;
  private readonly viewerUsername: string;

  constructor(
    viewerUsername: string,
    storageState: Record<string, unknown>,
    sessionOpts?: Partial<BrowserSessionOptions>,
  ) {
    this.viewerUsername = viewerUsername;
    this.session = new BrowserSession({
      sessionKey: `x_scraper_${viewerUsername}`,
      storageState,
      // スクレイプ時は画像不要だが CSS は必要なので blockResources はデフォルト
      ...sessionOpts,
    });
  }

  async init(): Promise<void> {
    await this.session.init();
  }

  private get page(): Page {
    return this.session.page;
  }

  /**
   * プロフィールページの基本情報を取得
   */
  async getProfile(username: string): Promise<XProfile> {
    const handle = username.replace(/^@/, "");
    await this.page.goto(`${BASE_URL}/${handle}`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await humanDelay(2000, 3500);

    const displayName = await this.page
      .locator('div[data-testid="UserName"] span')
      .first()
      .textContent()
      .catch(() => null);

    const bio = await this.page
      .locator('div[data-testid="UserDescription"]')
      .textContent()
      .catch(() => null);

    const statsText = await this.page
      .locator('a[href$="/following"], a[href$="/verified_followers"]')
      .allTextContents()
      .catch(() => [] as string[]);

    const parseCount = (label: RegExp): number | undefined => {
      for (const t of statsText) {
        const m = t.match(label);
        if (m) return parseAbbreviated(m[1]);
      }
      return undefined;
    };

    return {
      username: handle,
      displayName: displayName ?? undefined,
      bio: bio ?? undefined,
      followerCount: parseCount(/([\d.,]+[KM]?)\s*(フォロワー|Followers)/i),
      followingCount: parseCount(/([\d.,]+[KM]?)\s*(フォロー中|Following)/i),
    };
  }

  /**
   * タイムライン or プロフィールページから投稿一覧を取得
   * @param handle @無しユーザー名。未指定ならホームタイムライン
   * @param limit 取得する投稿の最大数
   */
  async getPosts(handle: string | null, limit = 20): Promise<XPost[]> {
    const url = handle ? `${BASE_URL}/${handle.replace(/^@/, "")}` : `${BASE_URL}/home`;
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await humanDelay(2500, 4000);

    const collected: XPost[] = [];
    const seenIds = new Set<string>();
    const maxScrolls = Math.min(20, Math.ceil(limit / 3) + 3);

    for (let i = 0; i < maxScrolls && collected.length < limit; i++) {
      const articles = await this.page.$$('article[data-testid="tweet"]');
      for (const article of articles) {
        try {
          const href = await article
            .$eval('a[href*="/status/"]', (el) => (el as HTMLAnchorElement).getAttribute("href"))
            .catch(() => null);
          if (!href) continue;
          const m = href.match(/\/([^/]+)\/status\/(\d+)/);
          if (!m) continue;
          const authorUsername = m[1];
          const postId = m[2];
          if (seenIds.has(postId)) continue;
          seenIds.add(postId);

          const contentText = await article
            .$eval('div[data-testid="tweetText"]', (el) => el.textContent ?? "")
            .catch(() => "");

          const [likeRaw, repostRaw, replyRaw] = await Promise.all([
            article.$eval('[data-testid="like"]', (el) => el.textContent ?? "").catch(() => ""),
            article.$eval('[data-testid="retweet"]', (el) => el.textContent ?? "").catch(() => ""),
            article.$eval('[data-testid="reply"]', (el) => el.textContent ?? "").catch(() => ""),
          ]);

          const postedAt = await article
            .$eval("time", (el) => el.getAttribute("datetime"))
            .catch(() => null);

          collected.push({
            postId,
            authorUsername,
            contentText,
            likeCount:   parseAbbreviated(likeRaw)   ?? 0,
            repostCount: parseAbbreviated(repostRaw) ?? 0,
            replyCount:  parseAbbreviated(replyRaw)  ?? 0,
            postedAt:    postedAt ?? undefined,
            postUrl:     `${BASE_URL}${href}`,
          });

          if (collected.length >= limit) break;
        } catch {
          // individual post extraction failures are non-fatal
        }
      }

      if (collected.length >= limit) break;
      await humanScroll(this.page, 1200);
      await humanDelay(1500, 2500);
    }

    return collected.slice(0, limit);
  }

  async close(): Promise<void> {
    await this.session.close();
  }

  // viewerUsername is currently used as a session-key differentiator only,
  // but exposed here so downstream code can log which viewer was used.
  get viewer(): string {
    return this.viewerUsername;
  }
}

/**
 * "1.2K" / "3,456" / "2.1M" のような省略数値を整数に変換
 */
function parseAbbreviated(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[,\s]/g, "").trim();
  const m = cleaned.match(/([\d.]+)([KMBkmb]?)/);
  if (!m) return undefined;
  const num = parseFloat(m[1]);
  if (Number.isNaN(num)) return undefined;
  const suffix = m[2].toLowerCase();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return Math.round(num * multiplier);
}
