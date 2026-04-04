import path from "node:path";
import {
  BrowserSession,
  humanDelay,
  humanType,
  withRetry,
  type BrowserSessionOptions,
} from "./base.js";
import type { Page } from "playwright";

// ---------------------------------------------------------------
// Instagram セレクタ（UI 変更時はここだけ修正）
// ---------------------------------------------------------------
const SELECTORS = {
  // ログイン
  loginUsernameInput: 'input[name="email"]',
  loginPasswordInput: 'input[name="pass"]',
  loginSubmitButton: '[aria-label="Log In"], [aria-label="ログイン"], input[type="submit"]',
  loginNotNowButton: 'div:has-text("Not now"):not(:has(*)), button:has-text("Not now"), text="後で"',
  loginSaveInfoNotNow: 'div:has-text("Not now"):not(:has(*)), button:has-text("Not now"), text="情報を保存しない"',
  turnOnNotificationsNotNow:
    'button:has-text("Not Now"), button:has-text("後で"), button:has-text("Not now")',

  // 投稿（新規作成フロー）
  newPostButton: '[aria-label="新規投稿"], [aria-label="New post"]',
  fileInput: 'input[type="file"]',
  nextButton: 'button:has-text("次へ"), button:has-text("Next")',
  captionTextarea:
    'div[aria-label="キャプションを入力…"], div[aria-label="Write a caption..."], div[contenteditable="true"][role="textbox"]',
  shareButton:
    'button:has-text("シェア"), button:has-text("Share")',

  // ストーリー作成フロー（モバイルUA使用）
  storySectionLabel: 'text="ストーリーズ"',
  storyFileInput: 'input[type="file"]',
  storyShareButton: 'text="ストーリーズに追加"',

  // 状態確認
  profileIcon:
    'a[href="/"], a[href="/reels/"], nav a[href*="/"]',
  rateLimitIndicator:
    'text="しばらくしてから", text="Try Again Later", text="Action Blocked"',
  postSuccessIndicator:
    'text="投稿がシェアされました", text="Your post has been shared"',
} as const;

const BASE_URL = "https://www.instagram.com";

// ---------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------
export interface InstagramCredentials {
  username: string;
  password: string;
}

export interface InstagramPostOptions {
  /** キャプション（テキスト） */
  caption: string;
  /** 画像ファイルパス（最低1枚必須） */
  imagePaths: string[];
}

export interface InstagramPostResult {
  success: boolean;
  postUrl?: string;
  error?: string;
}

export interface InstagramStoryOptions {
  /** ストーリー用画像ファイルパス（1枚） */
  imagePath: string;
  /** テキストオーバーレイ（任意） */
  textOverlay?: string;
}

export interface InstagramStoryResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------
// InstagramBrowser クラス
// ---------------------------------------------------------------
export class InstagramBrowser {
  private session: BrowserSession;
  private credentials: InstagramCredentials;
  private readonly sessionOpts: Partial<BrowserSessionOptions>;

  constructor(
    credentials: InstagramCredentials,
    sessionOpts?: Partial<BrowserSessionOptions>,
  ) {
    this.credentials = credentials;
    this.sessionOpts = sessionOpts ?? {};
    this.session = new BrowserSession({
      sessionKey: `instagram_${credentials.username}`,
      ...sessionOpts,
    });
  }

  /** ブラウザ初期化 */
  async init(): Promise<void> {
    await this.session.init();
  }

  /** ページ取得ヘルパー */
  private get page(): Page {
    return this.session.page;
  }

  // =============================================================
  // ログイン
  // =============================================================
  async isLoggedIn(): Promise<boolean> {
    try {
      await this.page.goto(`${BASE_URL}/`, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });
      await humanDelay(2000, 4000);

      const url = this.page.url();
      if (url.includes("/accounts/login") || url.includes("/accounts/onetap")) {
        return false;
      }

      // 未ログイン状態ではログインボタンが表示される
      const loginBtn = await this.page.$('[aria-label="Log In"], [aria-label="ログイン"]');
      return loginBtn === null;
    } catch {
      return false;
    }
  }

  async login(): Promise<void> {
    if (await this.isLoggedIn()) {
      console.log("[instagram] Already logged in");
      return;
    }

    await withRetry(
      async () => {
        console.log("[instagram] Logging in...");
        await this.page.goto(`${BASE_URL}/accounts/login/`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await humanDelay(2000, 4000);

        // ユーザー名入力
        await humanType(
          this.page,
          SELECTORS.loginUsernameInput,
          this.credentials.username,
        );
        await humanDelay(500, 1000);

        // パスワード入力
        await humanType(
          this.page,
          SELECTORS.loginPasswordInput,
          this.credentials.password,
        );
        await humanDelay(500, 1200);

        // ログインボタンクリック
        await this.page.click(SELECTORS.loginSubmitButton);
        await humanDelay(5000, 8000);

        // 「情報を保存」ダイアログをスキップ
        const saveInfoBtn = await this.page.$(SELECTORS.loginSaveInfoNotNow);
        if (saveInfoBtn) {
          await saveInfoBtn.click();
          await humanDelay(1000, 2000);
        }

        // 「後で」ダイアログをスキップ
        const notNowBtn = await this.page.$(SELECTORS.loginNotNowButton);
        if (notNowBtn) {
          await notNowBtn.click();
          await humanDelay(1000, 2000);
        }

        // 通知ダイアログをスキップ
        const notifBtn = await this.page.$(
          SELECTORS.turnOnNotificationsNotNow,
        );
        if (notifBtn) {
          await notifBtn.click();
          await humanDelay(1000, 2000);
        }

        // ログイン成功確認（ログインページ・onetap以外であればOK）
        await this.page.waitForFunction(
          () => !location.href.includes("/accounts/login"),
          { timeout: 20_000 },
        );
        // onetap の場合はホームへ遷移
        if (this.page.url().includes("/accounts/onetap")) {
          await this.page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
          await humanDelay(2000, 3000);
        }
        console.log("[instagram] Login successful");

        // セッション保存
        await this.session.saveSession();
      },
      { maxRetries: 2, label: "instagram-login" },
    );
  }

  // =============================================================
  // 投稿
  // =============================================================
  async post(opts: InstagramPostOptions): Promise<InstagramPostResult> {
    if (!opts.imagePaths || opts.imagePaths.length === 0) {
      return { success: false, error: "At least one image is required for Instagram posts" };
    }

    try {
      if (!(await this.isLoggedIn())) {
        await this.login();
      }

      return await withRetry(
        async () => {
          await this.checkRateLimit();

          console.log("[instagram] Starting post...");

          // ホームに移動
          await this.page.goto(`${BASE_URL}/`, {
            waitUntil: "domcontentloaded",
            timeout: 15_000,
          });
          await humanDelay(2000, 3500);

          // 新規投稿ボタンをクリック
          await this.page.click(SELECTORS.newPostButton);
          await humanDelay(1500, 3000);

          // 画像をアップロード（file input 経由）
          await this.attachImages(opts.imagePaths);
          await humanDelay(2000, 4000);

          // 「次へ」ボタン（フィルター画面 → キャプション画面）
          // Instagram は2段階の「次へ」がある（切り抜き → フィルター → キャプション）
          await this.clickNextButton();
          await humanDelay(1500, 2500);
          await this.clickNextButton();
          await humanDelay(1500, 2500);

          // キャプション入力
          if (opts.caption) {
            await this.page.waitForSelector(SELECTORS.captionTextarea, {
              timeout: 10_000,
            });
            await humanType(
              this.page,
              SELECTORS.captionTextarea,
              opts.caption,
            );
            await humanDelay(800, 1500);
          }

          // 投稿前の最終遅延
          await humanDelay(1000, 2500);

          // シェアボタンクリック
          await this.clickShareButton();
          await humanDelay(3000, 6000);

          // 投稿成功確認
          await this.waitForPostSuccess();

          // 投稿 URL の取得を試みる
          const postUrl = await this.tryGetPostUrl();

          // セッション保存
          await this.session.saveSession();

          console.log("[instagram] Post successful");
          return { success: true, postUrl };
        },
        { maxRetries: 2, label: "instagram-post" },
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      console.error(`[instagram] Post failed: ${errorMessage}`);
      await this.session.screenshot("ig-post-error");
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 「次へ」ボタンをクリック
   */
  private async clickNextButton(): Promise<void> {
    const btn = this.page
      .getByRole("button", { name: /^(次へ|Next)$/ });

    await btn.first().click({ timeout: 10_000 });
  }

  /**
   * 「シェア」ボタンをクリック
   */
  private async clickShareButton(): Promise<void> {
    const btn = this.page
      .getByRole("button", { name: /^(シェア|Share)$/ });

    await btn.first().click({ timeout: 10_000 });
  }

  /**
   * 画像を添付する
   */
  private async attachImages(imagePaths: string[]): Promise<void> {
    const fileInput = await this.page.waitForSelector(SELECTORS.fileInput, {
      timeout: 10_000,
      state: "attached",
    });
    if (!fileInput) {
      throw new Error("Image upload input not found");
    }

    const resolvedPaths = imagePaths.map((p) => path.resolve(p));
    await fileInput.setInputFiles(resolvedPaths);
    // 画像アップロード待ち
    await humanDelay(3000, 6000);
    console.log(`[instagram] Attached ${imagePaths.length} image(s)`);
  }

  /**
   * 投稿成功を待つ
   */
  private async waitForPostSuccess(): Promise<void> {
    try {
      await this.page.waitForSelector(SELECTORS.postSuccessIndicator, {
        timeout: 30_000,
      });
    } catch {
      // 成功インジケーターが見つからなくてもエラーにしない
      // URL 変更やモーダル消失で成功を判断する場合もある
      console.warn("[instagram] Post success indicator not found, continuing...");
    }
  }

  /**
   * 投稿後に投稿URLの取得を試みる
   */
  private async tryGetPostUrl(): Promise<string | undefined> {
    try {
      await humanDelay(2000, 3000);
      const url = this.page.url();
      if (url.includes("/p/")) {
        return url;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  // =============================================================
  // ガード
  // =============================================================
  private async checkRateLimit(): Promise<void> {
    const rateLimited = await this.page.$(SELECTORS.rateLimitIndicator);
    if (rateLimited) {
      throw new Error("Rate limited by Instagram — try again later");
    }
  }

  // =============================================================
  // ストーリーズ投稿（モバイルUA使用）
  // =============================================================
  async postStory(
    opts: InstagramStoryOptions,
  ): Promise<InstagramStoryResult> {
    if (!opts.imagePath) {
      return { success: false, error: "Image path is required for story" };
    }

    // ストーリー投稿はモバイルUAが必要なため、専用セッションで実行
    const mobileSession = new BrowserSession({
      sessionKey: `instagram_${this.credentials.username}`,
      ...this.sessionOpts,
      mobile: true,
    });

    try {
      await mobileSession.init();
      const page = mobileSession.page;

      // ログイン確認（既存セッションを流用）
      await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await humanDelay(2000, 4000);

      const url = page.url();
      if (url.includes("/accounts/login") || url.includes("/accounts/onetap")) {
        return { success: false, error: "Not logged in — run login() first with desktop session" };
      }

      return await withRetry(
        async () => {
          console.log("[instagram] Starting story post (mobile flow)...");

          // ホームに移動
          await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
          await humanDelay(2000, 3500);

          // ダイアログを閉じる（「後で」「情報を保存しない」）
          for (const sel of [
            'button:has-text("後で")',
            'button:has-text("Not Now")',
            'button:has-text("情報を保存しない")',
          ]) {
            const btn = await page.$(sel);
            if (btn) {
              await btn.click();
              await humanDelay(800, 1200);
            }
          }

          // 「ストーリーズ」セクションラベルをクリック（ユーザー自身のストーリー追加ボタン）
          const storyLabel = await page.waitForSelector(
            SELECTORS.storySectionLabel,
            { timeout: 10_000 },
          );
          await storyLabel.click({ force: true });
          await humanDelay(1500, 2500);
          console.log("[instagram] Clicked story section");

          // ファイルインプットを取得
          const fileInput = await page.waitForSelector(
            SELECTORS.storyFileInput,
            { timeout: 10_000, state: "attached" },
          );
          if (!fileInput) {
            throw new Error("Story file input not found");
          }

          const resolvedPath = path.resolve(opts.imagePath);
          await fileInput.setInputFiles(resolvedPath);
          await humanDelay(3000, 5000);
          console.log(`[instagram] Attached story image: ${opts.imagePath}`);

          // ストーリーエディタ（/create/story/）への遷移を確認
          await page.waitForFunction(
            () => location.href.includes("/create/story/"),
            { timeout: 15_000 },
          );
          console.log("[instagram] Story editor opened ✓");
          await humanDelay(1000, 2000);

          // 「ストーリーズに追加」ボタンをクリック
          const shareBtn = await page.waitForSelector(
            SELECTORS.storyShareButton,
            { timeout: 10_000 },
          );
          await shareBtn.click();
          console.log("[instagram] Clicked 'ストーリーズに追加'");

          // アップロード完了まで待機（/create/story/ から離脱）
          await page.waitForFunction(
            () => !location.href.includes("/create/"),
            { timeout: 30_000 },
          );
          await humanDelay(1000, 2000);

          // セッション保存
          await mobileSession.saveSession();

          console.log("[instagram] Story posted successfully");
          return { success: true };
        },
        { maxRetries: 2, label: "instagram-story" },
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[instagram] Story post failed: ${errorMessage}`);
      await mobileSession.screenshot("ig-story-error");
      return { success: false, error: errorMessage };
    } finally {
      await mobileSession.close();
    }
  }

  // =============================================================
  // ライフサイクル
  // =============================================================
  async close(): Promise<void> {
    await this.session.saveSession();
    await this.session.close();
  }
}
