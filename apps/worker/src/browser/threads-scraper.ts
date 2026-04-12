import { BrowserSession, humanDelay, humanScroll, detectBlock, humanType, type BrowserSessionOptions } from "./base.js";
import type { Page } from "playwright";

// ── ブロック検知時のバックオフ（短縮版） ─────────────────────────────────────
// login_wall → 即スキップ（リトライしない）
// captcha    → 3s → 8s → 20s の短いバックオフ
const CAPTCHA_BACKOFF_MS = [3_000, 8_000, 20_000];

export interface ScrapedPost {
  authorUsername: string | null;
  authorFollowers: number | null;
  contentText: string;
  hasImage: boolean;
  /** 投稿内の画像URL（ブロックされていてもDOMのsrc属性から取得可能） */
  imageUrls: string[];
  likeCount: number;
  repostCount: number;
  replyCount: number;
  viewCount: number;
  postedAt: Date | null;
  /** Threadsの投稿URL（例: /@username/post/ABCD） — 時系列追跡用 */
  platformPostId: string | null;
}

export interface ScrapedAccountProfile {
  username: string;
  displayName: string | null;
  bio: string | null;
  followersCount: number | null;
  postsCount: number | null;
  /** "2024年3月" や "March 2024" 形式 */
  accountCreatedAt: string | null;
  /** 開設からの月数（算出値） */
  accountAgeMonths: number | null;
}

/** ワーカーから受け取る進捗コールバック */
export type ProgressCallback = (msg: string) => void;

// ============================================================
// Threads スクレイパー
// ============================================================
export class ThreadsScraper {
  private session: BrowserSession;
  private loggedIn = false;
  private onProgress: ProgressCallback;

  constructor(sessionOpts?: Partial<BrowserSessionOptions> & { username?: string }, onProgress?: ProgressCallback) {
    const { username, ...restOpts } = sessionOpts ?? {};
    const sessionKey = username ? `threads_${username}` : "threads_scraper";
    this.session = new BrowserSession({
      sessionKey,
      headless: true,
      blockResources: false, // Threadsはスタイルシートを必要とするためブロック無効
      ...restOpts,
    });
    this.onProgress = onProgress ?? ((msg) => console.log(`[scraper] ${msg}`));
  }

  async init(): Promise<void> {
    await this.session.init();
  }

  async close(): Promise<void> {
    await this.session.close();
  }

  // ─────────────────────────────────────────────────────────
  // ログイン（セッションキャッシュを優先し、不要なら省略）
  // ─────────────────────────────────────────────────────────
  async login(username: string, password: string): Promise<boolean> {
    if (this.loggedIn) return true;
    const page = this.session.page;

    try {
      this.onProgress("Threadsにログイン中...");
      await page.goto("https://www.threads.com/login", {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      await humanDelay(1000, 2000);

      // ログイン済みならスキップ
      if (!page.url().includes("/login")) {
        this.loggedIn = true;
        this.onProgress("ログイン済みセッションを使用");
        return true;
      }

      // ユーザー名とパスワードを入力
      // Threads ログインフォームのセレクタ（変わる可能性あり）
      const userSelector = "input[autocomplete='username'], input[name='username'], input[type='text']";
      const passSelector = "input[autocomplete='current-password'], input[name='password'], input[type='password']";

      await page.waitForSelector(userSelector, { timeout: 8_000 });
      await humanType(page, userSelector, username);
      await humanDelay(500, 1000);
      await humanType(page, passSelector, password);
      await humanDelay(500, 1000);

      // ログインボタンをクリック
      const loginBtn = page.locator("button[type='submit'], button:has-text('ログイン'), button:has-text('Log in')").first();
      await loginBtn.click();
      await humanDelay(2000, 4000);

      // ログイン後の確認
      await page.waitForURL((url) => !url.href.includes("/login"), { timeout: 15_000 }).catch(() => {});

      if (page.url().includes("/login")) {
        this.onProgress("ログイン失敗 — 認証情報を確認してください");
        return false;
      }

      this.loggedIn = true;
      await this.session.saveSession();
      this.onProgress("ログイン成功");
      return true;
    } catch (err) {
      this.onProgress(`ログインエラー: ${err}`);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────
  // ページロード + ブロック検知 + リトライ
  // ─────────────────────────────────────────────────────────
  private async _gotoWithBlockCheck(url: string, retries = 0): Promise<boolean> {
    const page = this.session.page;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    } catch {
      this.onProgress(`ページ読み込みタイムアウト: ${url}`);
      return false;
    }
    await humanDelay(600, 1200);

    const blockType = await detectBlock(page);
    if (!blockType) return true;

    this.onProgress(`ブロック検知: ${blockType}`);
    await this.session.screenshot(`block_${blockType}`);

    // login_wall → セッションが切れた可能性。リトライしても無駄なのでスキップ
    if (blockType === "login_wall") {
      this.onProgress("ログインウォール検知 — このキーワードをスキップします");
      return false;
    }

    // captcha / rate_limit → 短いバックオフ
    if (retries >= CAPTCHA_BACKOFF_MS.length) {
      this.onProgress("最大リトライ回数に達しました — スキップします");
      return false;
    }

    const wait = CAPTCHA_BACKOFF_MS[retries];
    this.onProgress(`${wait / 1000}秒後にリトライ (${retries + 1}/${CAPTCHA_BACKOFF_MS.length})...`);
    await new Promise((r) => setTimeout(r, wait));
    return this._gotoWithBlockCheck(url, retries + 1);
  }

  // ─────────────────────────────────────────────────────────
  // キーワード検索でバズ投稿を収集
  // ─────────────────────────────────────────────────────────
  async scrapeByKeyword(keyword: string, maxPosts = 50): Promise<ScrapedPost[]> {
    const page = this.session.page;
    const posts: ScrapedPost[] = [];
    this.onProgress(`「${keyword}」を検索中...`);

    try {
      const encodedKeyword = encodeURIComponent(keyword);
      const url = `https://www.threads.com/search?q=${encodedKeyword}&serp_type=default`;
      const ok = await this._gotoWithBlockCheck(url);
      if (!ok) {
        this.onProgress(`「${keyword}」: スキップ`);
        return [];
      }

      // Reactレンダリング完了を待つ（投稿コンテナが出現するまで最大10秒）
      await page.waitForSelector("[data-pressable-container], article", { timeout: 10_000 }).catch(() => {});
      await humanDelay(800, 1500);

      // 「もっと見る」「...more」リンクをクリックして全文展開
      await this._expandTruncatedPosts(page);

      const initial = await this._extractPostsFromPage(page, maxPosts);
      posts.push(...initial);
      this.onProgress(`「${keyword}」: 初期取得 ${posts.length}件`);

      // スクロールして追加投稿を取得
      let prevCount = 0;
      let scrollAttempts = 0;
      while (posts.length < maxPosts && scrollAttempts < 12) {
        await humanScroll(page, 800);
        await humanDelay(600, 1200);

        const blockType = await detectBlock(page);
        if (blockType) {
          this.onProgress(`「${keyword}」: スクロール中にブロック (${blockType})`);
          break;
        }

        await this._expandTruncatedPosts(page);
        const newPosts = await this._extractPostsFromPage(page, maxPosts - posts.length);
        const uniqueNew = newPosts.filter(np =>
          !posts.some(p => p.contentText === np.contentText),
        );
        posts.push(...uniqueNew);
        if (posts.length === prevCount) scrollAttempts++;
        else { scrollAttempts = 0; this.onProgress(`「${keyword}」: ${posts.length}件取得中...`); }
        prevCount = posts.length;
      }

      this.onProgress(`「${keyword}」: 完了 ${posts.length}件`);
    } catch (err) {
      this.onProgress(`「${keyword}」: エラー ${err}`);
    }

    return posts.slice(0, maxPosts);
  }

  // ─────────────────────────────────────────────────────────
  // おすすめフィード（ログイン不要のFor You）から収集
  // ─────────────────────────────────────────────────────────
  async scrapeForYouFeed(maxPosts = 100): Promise<ScrapedPost[]> {
    const page = this.session.page;
    const posts: ScrapedPost[] = [];
    this.onProgress("おすすめフィードを収集中...");

    try {
      const ok = await this._gotoWithBlockCheck("https://www.threads.com/");
      if (!ok) {
        this.onProgress("フィード収集: スキップ");
        return [];
      }

      posts.push(...await this._extractPostsFromPage(page, maxPosts));

      let prevCount = 0;
      let scrollAttempts = 0;
      while (posts.length < maxPosts && scrollAttempts < 20) {
        await humanScroll(page, 1000);
        await humanDelay(600, 1200);

        const blockType = await detectBlock(page);
        if (blockType) {
          this.onProgress(`フィード: ブロック検知 (${blockType})`);
          break;
        }

        const newPosts = await this._extractPostsFromPage(page, maxPosts - posts.length);
        const uniqueNew = newPosts.filter(np =>
          !posts.some(p => p.contentText === np.contentText),
        );
        posts.push(...uniqueNew);
        if (posts.length === prevCount) scrollAttempts++;
        else { scrollAttempts = 0; }
        prevCount = posts.length;
      }
      this.onProgress(`フィード: ${posts.length}件取得`);
    } catch (err) {
      this.onProgress(`フィード収集エラー: ${err}`);
    }

    return posts.slice(0, maxPosts);
  }

  // ─────────────────────────────────────────────────────────
  // アカウントプロフィールから投稿を収集
  // ─────────────────────────────────────────────────────────
  async scrapeAccountPosts(username: string, maxPosts = 20): Promise<ScrapedPost[]> {
    const page = this.session.page;
    const posts: ScrapedPost[] = [];
    this.onProgress(`@${username} の投稿を収集中...`);

    try {
      const url = `https://www.threads.com/@${username}`;
      const ok = await this._gotoWithBlockCheck(url);
      if (!ok) {
        this.onProgress(`@${username}: スキップ`);
        return [];
      }

      await page.waitForSelector("[data-pressable-container], article", { timeout: 10_000 }).catch(() => {});
      await humanDelay(1000, 2000);

      const initial = await this._extractPostsFromPage(page, maxPosts);
      posts.push(...initial);
      this.onProgress(`@${username}: 初期取得 ${posts.length}件`);

      let prevCount = 0;
      let scrollAttempts = 0;
      while (posts.length < maxPosts && scrollAttempts < 8) {
        await humanScroll(page, 800);
        await humanDelay(600, 1200);
        const newPosts = await this._extractPostsFromPage(page, maxPosts - posts.length);
        const uniqueNew = newPosts.filter(np => !posts.some(p => p.contentText === np.contentText));
        posts.push(...uniqueNew);
        if (posts.length === prevCount) scrollAttempts++;
        else { scrollAttempts = 0; }
        prevCount = posts.length;
      }
      this.onProgress(`@${username}: 完了 ${posts.length}件`);
    } catch (err) {
      this.onProgress(`@${username}: エラー ${err}`);
    }

    return posts.slice(0, maxPosts);
  }

  // ─────────────────────────────────────────────────────────
  // アカウントプロフィール情報を取得（開設日・フォロワー数など）
  // ─────────────────────────────────────────────────────────
  async scrapeAccountProfile(username: string): Promise<ScrapedAccountProfile> {
    const page = this.session.page;
    this.onProgress(`@${username} のプロフィールを取得中...`);

    const empty: ScrapedAccountProfile = {
      username,
      displayName: null,
      bio: null,
      followersCount: null,
      postsCount: null,
      accountCreatedAt: null,
      accountAgeMonths: null,
    };

    try {
      const url = `https://www.threads.com/@${username}`;
      const ok = await this._gotoWithBlockCheck(url);
      if (!ok) return empty;

      await page.waitForSelector("[data-pressable-container], article, header", { timeout: 10_000 }).catch(() => {});
      await humanDelay(1000, 2000);

      const profileData = await page.evaluate(function(uname) {
        // ─ 表示名 ─
        var displayName = null;
        var h1 = document.querySelector("h1");
        if (h1) displayName = (h1.textContent || "").trim() || null;

        // ─ バイオ ─
        var bio = null;
        var bioSelectors = [
          "[data-testid='userBio']",
          "[class*='bio']",
          "div[dir='auto']:not(a *)",
        ];
        for (var bi = 0; bi < bioSelectors.length; bi++) {
          var bioEl = document.querySelector(bioSelectors[bi]);
          if (bioEl) {
            var t = (bioEl.textContent || "").trim();
            if (t.length > 3 && t.length < 500) { bio = t; break; }
          }
        }

        // ─ フォロワー数 ─
        var followersCount = null;
        var allLinks = document.querySelectorAll("a[href*='/followers'], a[href*='followers']");
        for (var li = 0; li < allLinks.length; li++) {
          var linkText = (allLinks[li].textContent || "").trim();
          var m = linkText.match(/([\d.,]+)\s*[万千KkMm]?\s*(フォロワー|followers?)/i);
          if (m) {
            var num = parseFloat(m[1].replace(/,/g, ""));
            var unit = linkText;
            if (/万/.test(unit)) num = Math.round(num * 10000);
            else if (/千/.test(unit)) num = Math.round(num * 1000);
            else if (/[Kk]/.test(unit)) num = Math.round(num * 1000);
            else if (/[Mm]/.test(unit)) num = Math.round(num * 1000000);
            followersCount = Math.round(num);
            break;
          }
        }
        // フォロワー数をテキストから抽出（リンクが見つからない場合）
        if (followersCount === null) {
          var bodyText = document.body.innerText || "";
          var fMatch = bodyText.match(/([\d,]+(?:\.\d+)?)\s*[万千]?\s*(フォロワー|followers?)/i);
          if (fMatch) {
            var fn = parseFloat(fMatch[1].replace(/,/g, ""));
            if (/万/.test(fMatch[0])) fn = Math.round(fn * 10000);
            followersCount = Math.round(fn);
          }
        }

        // ─ アカウント開設日 ─
        var accountCreatedAt = null;
        var pageText = document.body.innerText || "";

        // 英語パターン: "Joined January 2024" / "Joined Jan 2024"
        var engMatch = pageText.match(/Joined\s+([A-Za-z]+\s+\d{4})/);
        if (engMatch) accountCreatedAt = engMatch[1];

        // 日本語パターン: "2024年1月に参加" / "2024年1月参加"
        if (!accountCreatedAt) {
          var jpMatch = pageText.match(/(\d{4})年(\d+)月[にに]?参加/);
          if (jpMatch) accountCreatedAt = jpMatch[1] + "年" + jpMatch[2] + "月";
        }

        // "年月日" だけのパターン: "2024年1月"
        if (!accountCreatedAt) {
          var jpMatch2 = pageText.match(/(\d{4})年(\d{1,2})月/);
          if (jpMatch2) {
            var yr = parseInt(jpMatch2[1]);
            if (yr >= 2016 && yr <= 2030) {
              accountCreatedAt = jpMatch2[1] + "年" + jpMatch2[2] + "月";
            }
          }
        }

        // ─ 投稿数 ─
        var postsCount = null;
        var postsMatch = pageText.match(/([\d,]+)\s*(投稿|posts?)/i);
        if (postsMatch) {
          postsCount = parseInt(postsMatch[1].replace(/,/g, ""));
        }

        return {
          displayName: displayName,
          bio: bio,
          followersCount: followersCount,
          accountCreatedAt: accountCreatedAt,
          postsCount: postsCount,
        };
      }, username);

      // 開設からの月数を計算
      const accountAgeMonths = _calcAccountAgeMonths(profileData.accountCreatedAt);

      this.onProgress(`@${username}: フォロワー=${profileData.followersCount ?? "不明"} 開設=${profileData.accountCreatedAt ?? "不明"}`);

      return {
        username,
        displayName: profileData.displayName,
        bio: profileData.bio,
        followersCount: profileData.followersCount,
        postsCount: profileData.postsCount,
        accountCreatedAt: profileData.accountCreatedAt,
        accountAgeMonths,
      };
    } catch (err) {
      this.onProgress(`@${username}: プロフィール取得エラー ${err}`);
      return empty;
    }
  }

  // ─────────────────────────────────────────────────────────
  // 「もっと見る」「...more」リンクを全てクリックして全文展開
  // ─────────────────────────────────────────────────────────
  private async _expandTruncatedPosts(page: Page): Promise<void> {
    try {
      const moreLinks = page.locator(
        "span:text-is('more'), span:text-is('もっと見る'), " +
        "a:text-is('more'), a:text-is('もっと見る'), " +
        "div[role='button']:text-is('more'), div[role='button']:text-is('もっと見る'), " +
        "span:text-is('…more'), span:text-is('…もっと見る')"
      );
      const count = await moreLinks.count().catch(() => 0);
      for (let i = 0; i < Math.min(count, 50); i++) {
        try {
          await moreLinks.nth(i).click({ timeout: 1000 });
          await humanDelay(200, 400);
        } catch {
          // クリック失敗は無視（既に展開済みなど）
        }
      }
    } catch {
      // 展開リンクがなくても問題なし
    }
  }

  // ─────────────────────────────────────────────────────────
  // ページからDOM解析で投稿一覧を抽出
  // ─────────────────────────────────────────────────────────
  private async _extractPostsFromPage(page: Page, limit: number): Promise<ScrapedPost[]> {
    const raw = await page.evaluate(function(lim) {
      var results = [];

      var postContainers = document.querySelectorAll(
        "[data-pressable-container], article, div[role='article']",
      );

      for (var ci = 0; ci < postContainers.length; ci++) {
        if (results.length >= lim) break;
        var container = postContainers[ci];

        // <a>タグ外のspan[dir]から投稿本文を取得（<a>内はユーザー名）
        var allSpans = container.querySelectorAll("span[dir='auto'], span[dir='ltr'], span[dir='rtl'], [data-text-content]");
        var contentParts = [];
        for (var si = 0; si < allSpans.length; si++) {
          var span = allSpans[si];
          if (span.closest("a")) continue;
          var t = (span.textContent || "").trim();
          if (t.length >= 5 && !/^[\d/:. ]+$/.test(t)) contentParts.push(t);
        }
        var contentText = contentParts.join(" ");
        if (!contentText || contentText.length < 5) continue;

        var usernameEl = container.querySelector("a[href*='/@']");
        var authorUsername = usernameEl
          ? (usernameEl.getAttribute("href") || "").replace("/@", "").replace("/", "") || null
          : null;

        var imgEls = container.querySelectorAll("img[src*='cdninstagram'], img[src*='fbcdn'], img[src*='scontent']");
        var imageUrls = [];
        for (var ii = 0; ii < imgEls.length && imageUrls.length < 3; ii++) {
          var src = imgEls[ii].getAttribute("src") || "";
          if (src.startsWith("http") && !src.includes(".svg")) imageUrls.push(src);
        }
        var hasImage = imageUrls.length > 0;

        var likeCount = 0, repostCount = 0, replyCount = 0, viewCount = 0;

        // ── エンゲージメント数値のインライン抽出 ──
        // NOTE: page.evaluate内ではfunction宣言/式を使うとesbuildが__nameを注入しクラッシュする
        // そのため全ロジックをインラインで記述する

        // 方式1: aria-label ベース（従来方式）
        var buttons = container.querySelectorAll("button, [role='button']");
        var ariaMatched = false;
        for (var bi = 0; bi < buttons.length; bi++) {
          var ariaLabel = (buttons[bi].getAttribute("aria-label") || "").toLowerCase();
          var btnText = (buttons[bi].textContent || "").replace(/[,，]/g, "").trim();
          // インライン数値パース
          var m = btnText.match(/([\d.]+)\s*([KkMm万千]?)/);
          var cnt = 0;
          if (m) {
            var num = parseFloat(m[1]);
            var unit = m[2].toLowerCase();
            cnt = unit === "k" ? Math.round(num * 1000)
                : unit === "m" ? Math.round(num * 1000000)
                : unit === "万" ? Math.round(num * 10000)
                : unit === "千" ? Math.round(num * 1000)
                : Math.round(num);
          }
          if (ariaLabel.includes("いいね") || ariaLabel.includes("like")) { likeCount = cnt; ariaMatched = true; }
          else if (ariaLabel.includes("リポスト") || ariaLabel.includes("repost") || ariaLabel.includes("rethread")) { repostCount = cnt; ariaMatched = true; }
          else if (ariaLabel.includes("返信") || ariaLabel.includes("reply") || ariaLabel.includes("comment")) { replyCount = cnt; ariaMatched = true; }
          else if (ariaLabel.includes("表示") || ariaLabel.includes("view")) { viewCount = cnt; ariaMatched = true; }
        }

        // 方式2: aria-label で取れなかった場合、SVG隣接テキスト＋位置ベースで推定
        // Threadsのアクションバーは [いいね(❤️), 返信(💬), リポスト(🔄), シェア(✈️)] の順
        if (!ariaMatched) {
          var actionCounts = [];
          for (var ab = 0; ab < buttons.length; ab++) {
            var abtn = buttons[ab];
            if (abtn.querySelector("svg")) {
              var abText = (abtn.textContent || "").replace(/[,，\s]/g, "").trim();
              var abm = abText.match(/([\d.]+)\s*([KkMm万千]?)/);
              var abcnt = 0;
              if (abm) {
                var abn = parseFloat(abm[1]);
                var abu = abm[2].toLowerCase();
                abcnt = abu === "k" ? Math.round(abn * 1000)
                    : abu === "m" ? Math.round(abn * 1000000)
                    : abu === "万" ? Math.round(abn * 10000)
                    : abu === "千" ? Math.round(abn * 1000)
                    : Math.round(abn);
              }
              actionCounts.push(abcnt);
            }
          }
          if (actionCounts.length >= 3) {
            likeCount   = actionCounts[0];
            replyCount  = actionCounts[1];
            repostCount = actionCounts[2];
            // actionCounts[3] はシェアボタン（数値なし）→ viewCountには入れない
          }
        }

        var timeEl = container.querySelector("time");
        var postedAt = timeEl ? timeEl.getAttribute("datetime") : null;

        // 投稿個別URLを取得（時系列追跡用）
        var postLinkEl = container.querySelector("a[href*='/post/']");
        var platformPostId = postLinkEl ? postLinkEl.getAttribute("href") : null;

        results.push({
          authorUsername: authorUsername,
          authorFollowers: null,
          contentText: contentText,
          hasImage: hasImage,
          imageUrls: imageUrls,
          likeCount: likeCount,
          repostCount: repostCount,
          replyCount: replyCount,
          viewCount: viewCount,
          postedAt: postedAt,
          platformPostId: platformPostId,
        });
      }
      return results;
    }, limit);

    return raw.map((r) => ({
      ...r,
      postedAt: r.postedAt ? new Date(r.postedAt) : null,
      platformPostId: r.platformPostId ?? null,
    }));
  }
}

// ============================================================
// アカウント開設月数の計算
// ============================================================
export function _calcAccountAgeMonths(createdAtStr: string | null): number | null {
  if (!createdAtStr) return null;

  const monthNamesEn: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
    sep: 8, oct: 9, nov: 10, dec: 11,
  };

  let year: number | null = null;
  let month: number | null = null;

  // 英語: "April 2024" / "Apr 2024"
  const engMatch = createdAtStr.match(/([A-Za-z]+)\s+(\d{4})/);
  if (engMatch) {
    month = monthNamesEn[engMatch[1].toLowerCase()] ?? null;
    year = parseInt(engMatch[2]);
  }

  // 日本語: "2024年4月"
  if (year === null) {
    const jpMatch = createdAtStr.match(/(\d{4})年(\d{1,2})月/);
    if (jpMatch) {
      year = parseInt(jpMatch[1]);
      month = parseInt(jpMatch[2]) - 1;
    }
  }

  if (year === null || month === null) return null;

  const now = new Date();
  const created = new Date(year, month, 1);
  const diffMs = now.getTime() - created.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44)));
}

// ============================================================
// バズスコア計算
// ============================================================
export function calcBuzzScore(post: ScrapedPost): { buzzScore: number; engagementRate: number } {
  // 重み付きエンゲージメント合計（リポストとコメントはバイラル性が高いため高重み）
  const rawEngagement = post.likeCount * 1 + post.repostCount * 3 + post.replyCount * 2;

  // フォロワー数がわかる場合はエンゲージメント率ベース、不明なら絶対数ベース
  const followers = post.authorFollowers;
  let engagementRate: number;
  let buzzScore: number;

  if (followers && followers > 0) {
    // フォロワー数が判明 → エンゲージメント率ベース
    engagementRate = rawEngagement / followers;
  } else {
    // フォロワー数不明 → 絶対数を正規化（100エンゲージメント = 1.0）
    engagementRate = rawEngagement / 100;
  }

  // 時間減衰（古い投稿ほどスコアが下がる）
  let timeDecay = 1.0;
  if (post.postedAt) {
    const hoursAgo = (Date.now() - post.postedAt.getTime()) / (1000 * 60 * 60);
    timeDecay = Math.exp(-0.01 * hoursAgo); // ゆるやかな減衰（0.01）
  }

  // バズスコア = エンゲージメント率 × 時間減衰 × ログブースト
  // ログブーストにより、いいね数が多い投稿ほどスコアが上がる
  const logBoost = rawEngagement > 0 ? Math.log10(rawEngagement + 1) : 0;
  buzzScore = engagementRate * timeDecay * (1 + logBoost * 0.5);

  return {
    buzzScore: Math.round(buzzScore * 10000) / 10000,
    engagementRate: Math.round(engagementRate * 10000) / 10000,
  };
}

// ============================================================
// 投稿フォーマット分類
// ============================================================
export function classifyPostFormat(text: string): string {
  const t = text.trim();
  if (/[？?]/.test(t) && (/思いますか|どう(ですか|思う)?|あなた|皆さん/.test(t) || t.endsWith("？") || t.endsWith("?"))) return "question";
  if (/^[①②③④⑤1-9]\.|[\n][ \t]*[・•\-●◆▶→]/m.test(t) || /\n[1-9]\./m.test(t)) return "list";
  if (/私は|僕は|実は|昨日|先日|〜した|ました。|でした。|きました|ていた/.test(t)) return "story";
  if ((t.length < 100) && /笑|ｗ+|www|（笑）|\(笑\)|だよね。|だな。|わかる。/.test(t)) return "punchline";
  if (/べき|ほうがいい|大事|重要|必要|絶対|間違い|真実|本質/.test(t)) return "opinion";
  return "other";
}
