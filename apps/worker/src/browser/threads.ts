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
// Threads セレクタ（UI 変更時はここだけ修正）
// 2026-03-24 threads.com UI 実機確認済み
// ---------------------------------------------------------------
const SELECTORS = {
  // ログイン（threads.com の Instagram 埋め込みフォーム）
  loginUsernameInput: 'input[autocomplete="username"]',
  loginPasswordInput: 'input[type="password"]',
  // submitボタンは非表示のため Enter キーで送信（loginSubmitButton は未使用）
  loginNotNowButton: 'text="後で"',
  loginSaveInfoNotNow: 'text="情報を保存しない"',

  // 投稿
  newPostButton: '[aria-label="作成"], [aria-label="Create"]',
  postTextarea:
    '[data-lexical-editor="true"], [contenteditable="true"][role="textbox"], div[contenteditable="true"]',
  attachImageButton: 'input[type="file"]',
  // publishButton は page.click() では使わず clickPublishButton() で処理

  // 状態確認（ナビゲーションの「作成」ボタン存在 = ログイン済み）
  profileIcon: '[aria-label="作成"], [aria-label="Create"], [aria-label="プロフィール"], [aria-label="Profile"]',
  rateLimitIndicator: 'text="しばらくしてから"',
} as const;

// Threads のベース URL（threads.net → threads.com にリダイレクトされる）
const BASE_URL = "https://www.threads.com";

// ---------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------
export interface ThreadsCredentials {
  username: string;
  password: string;
}

export interface ThreadsPostOptions {
  /** 投稿本文 */
  text: string;
  /** 画像ファイルパス（複数可） */
  imagePaths?: string[];
}

export interface ThreadsPostResult {
  success: boolean;
  /** Threads側の投稿URL（取得できた場合） */
  postUrl?: string;
  error?: string;
}

// ---------------------------------------------------------------
// ThreadsBrowser クラス
// ---------------------------------------------------------------
export class ThreadsBrowser {
  private session: BrowserSession;
  private credentials: ThreadsCredentials;

  constructor(
    credentials: ThreadsCredentials,
    sessionOpts?: Partial<BrowserSessionOptions>,
  ) {
    this.credentials = credentials;
    this.session = new BrowserSession({
      sessionKey: `threads_${credentials.username}`,
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
  /**
   * ログイン済みかチェック
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      await this.page.goto(`${BASE_URL}/`, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });
      await humanDelay(2000, 4000);

      // ナビゲーションに「作成」ボタンがあればログイン済み
      const profileEl = await this.page.$(SELECTORS.profileIcon);
      return profileEl !== null;
    } catch {
      return false;
    }
  }

  /**
   * Threads にログイン（Instagram アカウント経由）
   */
  async login(): Promise<void> {
    // 既にログイン済みならスキップ
    if (await this.isLoggedIn()) {
      console.log("[threads] Already logged in");
      return;
    }

    await withRetry(
      async () => {
        console.log("[threads] Logging in...");
        await this.page.goto(`${BASE_URL}/login`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await humanDelay(2000, 4000);

        // ユーザー名入力（threads.com は autocomplete="username" フィールド）
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

        // Enter キーでフォーム送信（submit ボタンは DOM 上に存在するが非表示）
        await this.page.keyboard.press("Enter");
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

        // ログイン成功確認（ナビゲーションの「作成」ボタン出現を待つ）
        await this.page.waitForSelector(SELECTORS.profileIcon, {
          timeout: 20_000,
        });
        console.log("[threads] Login successful");

        // セッション保存
        await this.session.saveSession();
      },
      { maxRetries: 2, label: "threads-login" },
    );
  }

  // =============================================================
  // 投稿
  // =============================================================
  /**
   * テキスト投稿（画像オプション付き）
   */
  async post(opts: ThreadsPostOptions): Promise<ThreadsPostResult> {
    try {
      // ログイン確認
      if (!(await this.isLoggedIn())) {
        await this.login();
      }

      return await withRetry(
        async () => {
          // レート制限チェック
          await this.checkRateLimit();

          console.log("[threads] Starting post...");

          // ホームに移動
          await this.page.goto(`${BASE_URL}/`, {
            waitUntil: "domcontentloaded",
            timeout: 15_000,
          });
          await humanDelay(2000, 3500);

          // 新規投稿ボタンをクリック
          await this.page.click(SELECTORS.newPostButton);
          await humanDelay(1500, 3000);

          // テキスト入力
          await this.page.waitForSelector(SELECTORS.postTextarea, {
            timeout: 20_000,
          });
          await humanType(this.page, SELECTORS.postTextarea, opts.text);
          await humanDelay(800, 1500);

          // 画像添付（ある場合）
          if (opts.imagePaths && opts.imagePaths.length > 0) {
            await this.attachImages(opts.imagePaths);
          }

          // 投稿前の最終遅延（人間っぽく）
          await humanDelay(1000, 2500);

          // 投稿ボタンクリック（モーダル内の「投稿」ボタンを限定取得）
          await this.clickPublishButton();
          await humanDelay(3000, 5000);

          // 投稿 URL の取得を試みる
          const postUrl = await this.tryGetPostUrl();

          // セッション保存
          await this.session.saveSession();

          console.log("[threads] Post successful");
          return { success: true, postUrl };
        },
        { maxRetries: 2, label: "threads-post" },
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      console.error(`[threads] Post failed: ${errorMessage}`);
      await this.session.screenshot("post-error");
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 投稿モーダル内の「投稿」ボタンをクリックする
   *
   * ページ上には「投稿」ボタンが複数存在する（フィード上部 + モーダル内）ため、
   * role="dialog" にスコープを絞ることで確実にモーダル内のボタンを押す。
   */
  private async clickPublishButton(): Promise<void> {
    // role="dialog" 内の「投稿」ボタンを優先
    const dialogBtn = this.page
      .getByRole("dialog")
      .getByRole("button", { name: /^投稿$/ });

    if ((await dialogBtn.count()) > 0) {
      await dialogBtn.first().click();
      return;
    }

    // フォールバック: すべての「投稿」ボタンのうち最後のものを押す
    // （モーダルは後から描画されるため DOM 上は末尾になる）
    const allBtns = this.page
      .locator('div[role="button"]')
      .filter({ hasText: /^投稿$/ });

    const count = await allBtns.count();
    if (count > 0) {
      await allBtns.last().click();
      return;
    }

    throw new Error("Publish button not found in compose modal");
  }

  /**
   * 画像を添付する
   */
  private async attachImages(imagePaths: string[]): Promise<void> {
    const fileInput = await this.page.$(SELECTORS.attachImageButton);
    if (!fileInput) {
      throw new Error("Image upload input not found");
    }

    const resolvedPaths = imagePaths.map((p) => path.resolve(p));
    await fileInput.setInputFiles(resolvedPaths);
    // 画像アップロード待ち
    await humanDelay(3000, 5000);
    console.log(`[threads] Attached ${imagePaths.length} image(s)`);
  }

  /**
   * 投稿後に投稿URLの取得を試みる
   */
  private async tryGetPostUrl(): Promise<string | undefined> {
    try {
      // 投稿後のリダイレクトやトースト通知からURLを探す
      await humanDelay(2000, 3000);
      const url = this.page.url();
      if (url.includes("/post/") || url.includes("/t/")) {
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
  /**
   * レート制限を検知
   */
  private async checkRateLimit(): Promise<void> {
    const rateLimited = await this.page.$(SELECTORS.rateLimitIndicator);
    if (rateLimited) {
      throw new Error("Rate limited by Threads — try again later");
    }
  }

  // =============================================================
  // ライフサイクル
  // =============================================================
  /**
   * セッションを保存してブラウザを閉じる
   */
  async close(): Promise<void> {
    await this.session.saveSession();
    await this.session.close();
  }
}
