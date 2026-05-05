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
// X (旧 Twitter) セレクタ
// 2026-04 x.com UI 想定。壊れたらここだけ直す。
// ---------------------------------------------------------------
const SELECTORS = {
  // ログイン
  loginUsernameInput: 'input[name="text"], input[autocomplete="username"]',
  loginPasswordInput: 'input[name="password"], input[type="password"]',
  loginNextButton:    'button:has-text("次へ"), div[role="button"]:has-text("次へ"), button:has-text("Next"), div[role="button"]:has-text("Next")',
  loginSubmitButton:  'button[data-testid="LoginForm_Login_Button"], div[data-testid="LoginForm_Login_Button"]',

  // 投稿
  composeTrigger:     'a[href="/compose/post"], a[data-testid="SideNav_NewTweet_Button"], a[aria-label*="投稿"], a[aria-label*="Post"]',
  composeTextarea:    'div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]',
  composeSubmit:      'button[data-testid="tweetButton"], div[data-testid="tweetButton"], button[data-testid="tweetButtonInline"]',
  composeFileInput:   'input[data-testid="fileInput"], input[type="file"][accept*="image"]',

  // ログイン済みシグナル: サイドナビの「投稿」ボタン or ホームリンクが見えればOK
  loggedInSignal:
    'a[data-testid="SideNav_NewTweet_Button"], a[data-testid="AppTabBar_Home_Link"], a[href="/home"]',

  // エラー / レート制限
  rateLimitText:  'text="しばらく時間をおいて"',
  retryLaterText: 'text="Try again later"',
} as const;

const BASE_URL = "https://x.com";

// ---------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------
export interface XCredentials {
  username: string;
  /** 対話型ログイン(x-login.ts)で取得したPlaywright storageState。推奨。 */
  storageState?: Record<string, unknown>;
  /** フォールバック: パスワードログイン（CAPTCHA/2FAで失敗する可能性が高い） */
  password?: string;
}

export interface XPostOptions {
  text: string;
  imagePaths?: string[];
}

export interface XPostResult {
  success: boolean;
  postUrl?: string;
  error?: string;
}

// ---------------------------------------------------------------
// XBrowser クラス
// ---------------------------------------------------------------
export class XBrowser {
  private session: BrowserSession;
  private credentials: XCredentials;

  constructor(
    credentials: XCredentials,
    sessionOpts?: Partial<BrowserSessionOptions>,
  ) {
    this.credentials = credentials;
    this.session = new BrowserSession({
      sessionKey: `x_${credentials.username}`,
      storageState: credentials.storageState,
      ...sessionOpts,
    });
  }

  async init(): Promise<void> {
    await this.session.init();
  }

  private get page(): Page {
    return this.session.page;
  }

  // =============================================================
  // ログイン状態
  // =============================================================
  async isLoggedIn(): Promise<boolean> {
    try {
      await this.page.goto(`${BASE_URL}/home`, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });
      await humanDelay(2000, 4000);
      const el = await this.page.$(SELECTORS.loggedInSignal);
      return el !== null;
    } catch {
      return false;
    }
  }

  /**
   * ログインを試みる。storageState があればそれをそのまま使う。
   * storageState が無く password だけある場合はパスワードログインを試行
   * （CAPTCHA/2FA で失敗することが多い。対話型ログインの使用を推奨）。
   */
  async login(): Promise<void> {
    if (await this.isLoggedIn()) {
      console.log("[x] Already logged in");
      return;
    }

    if (!this.credentials.password) {
      throw new Error(
        "[x] Not logged in and no password provided. " +
          "Run `pnpm --filter @sns-automation/worker x-login` locally and upload the resulting storageState via /accounts UI.",
      );
    }

    await withRetry(
      async () => {
        console.log("[x] Attempting password login (fallback path)");
        await this.page.goto(`${BASE_URL}/login`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await humanDelay(2000, 4000);

        await humanType(
          this.page,
          SELECTORS.loginUsernameInput,
          this.credentials.username,
        );
        await humanDelay(500, 1200);

        // 「次へ」ボタンを探す
        const nextBtn = await this.page.$(SELECTORS.loginNextButton);
        if (nextBtn) {
          await nextBtn.click();
        } else {
          await this.page.keyboard.press("Enter");
        }
        await humanDelay(2500, 4500);

        await humanType(
          this.page,
          SELECTORS.loginPasswordInput,
          this.credentials.password!,
        );
        await humanDelay(500, 1200);

        const submitBtn = await this.page.$(SELECTORS.loginSubmitButton);
        if (submitBtn) {
          await submitBtn.click();
        } else {
          await this.page.keyboard.press("Enter");
        }
        await humanDelay(5000, 8000);

        await this.page.waitForSelector(SELECTORS.loggedInSignal, {
          timeout: 20_000,
        });
        console.log("[x] Password login successful");
        await this.session.saveSession();
      },
      { maxRetries: 1, label: "x-login" },
    );
  }

  // =============================================================
  // 投稿
  // =============================================================
  async post(opts: XPostOptions): Promise<XPostResult> {
    try {
      if (!(await this.isLoggedIn())) {
        await this.login();
      }

      return await withRetry(
        async () => {
          await this.checkRateLimit();

          console.log("[x] Starting post...");
          await this.page.goto(`${BASE_URL}/home`, {
            waitUntil: "domcontentloaded",
            timeout: 15_000,
          });
          await humanDelay(2000, 3500);

          // 投稿トリガーをクリック（サイドナビ or ホーム上部）
          const trigger = await this.page.$(SELECTORS.composeTrigger);
          if (trigger) {
            await trigger.click();
            await humanDelay(1500, 2800);
          }

          await this.page.waitForSelector(SELECTORS.composeTextarea, {
            timeout: 20_000,
          });
          await humanType(this.page, SELECTORS.composeTextarea, opts.text);
          await humanDelay(800, 1500);

          if (opts.imagePaths && opts.imagePaths.length > 0) {
            await this.attachImages(opts.imagePaths);
          }

          await humanDelay(1200, 2500);

          const submitBtn = await this.page.$(SELECTORS.composeSubmit);
          if (!submitBtn) throw new Error("Post button not found");
          await submitBtn.click();
          await humanDelay(3500, 5500);

          const postUrl = await this.tryGetPostUrl();
          await this.session.saveSession();

          console.log("[x] Post successful");
          return { success: true, postUrl };
        },
        { maxRetries: 2, label: "x-post" },
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[x] Post failed: ${errorMessage}`);
      await this.session.screenshot("x-post-error");
      return { success: false, error: errorMessage };
    }
  }

  private async attachImages(imagePaths: string[]): Promise<void> {
    const fileInput = await this.page.$(SELECTORS.composeFileInput);
    if (!fileInput) throw new Error("Image upload input not found");
    const resolvedPaths = imagePaths.map((p) => path.resolve(p));
    await fileInput.setInputFiles(resolvedPaths);
    await humanDelay(3000, 5000);
    console.log(`[x] Attached ${imagePaths.length} image(s)`);
  }

  private async tryGetPostUrl(): Promise<string | undefined> {
    try {
      await humanDelay(1500, 3000);
      const url = this.page.url();
      if (url.includes("/status/")) return url;
      return undefined;
    } catch {
      return undefined;
    }
  }

  // =============================================================
  // ガード
  // =============================================================
  private async checkRateLimit(): Promise<void> {
    const body = await this.page.locator("body").textContent().catch(() => "");
    if (!body) return;
    if (body.includes("Try again later") || body.includes("しばらく時間をおいて")) {
      throw new Error("Rate limited by X — try again later");
    }
  }

  // =============================================================
  // ライフサイクル
  // =============================================================
  /** 内部の Page を公開（scraper や x-login.ts 用） */
  getPage(): Page {
    return this.session.page;
  }

  /** 現在のブラウザコンテキストの storageState を取得（対話型ログイン保存用） */
  async dumpStorageState(): Promise<Record<string, unknown>> {
    return this.session.getStorageState();
  }

  async close(): Promise<void> {
    await this.session.saveSession();
    await this.session.close();
  }
}
