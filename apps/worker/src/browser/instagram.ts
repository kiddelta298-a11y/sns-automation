import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";
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
  // 左サイドナビの「新規投稿/New post」ボタン or リンク。
  // クリックするとサブメニュー（"Post"/"Live video"/"Ad" など）が開く新UI。
  newPostButton:
    '[aria-label="新規投稿"], [aria-label="New post"], a[role="link"]:has-text("Create"), a[role="link"]:has-text("作成")',
  // サブメニューの「投稿/Post」項目
  newPostMenuItemPost:
    'a[role="link"]:has-text("Post"):not(:has-text("Live")), a[role="link"]:has-text("投稿"):not(:has-text("ライブ"))',
  fileInput: 'input[type="file"][accept*="image"], input[type="file"]',
  nextButton: 'button:has-text("次へ"), button:has-text("Next")',
  captionTextarea:
    'div[aria-label="キャプションを入力…"], div[aria-label="Write a caption..."], div[contenteditable="true"][role="textbox"]',
  shareButton:
    'button:has-text("シェア"), button:has-text("Share")',
  // フィード作成画面の「リンクを追加/Add link」ボタン
  addLinkButton:
    'button:has-text("リンクを追加"), button:has-text("Add link"), [aria-label="Add link"], [aria-label="リンクを追加"]',
  addLinkUrlInput:
    'input[placeholder*="URL"], input[name="link-url"], input[type="url"]',
  addLinkLabelInput:
    'input[placeholder*="リンクの"], input[placeholder*="link"], input[name="link-label"], input[aria-label*="link"]',
  addLinkDoneButton:
    'button:has-text("完了"), button:has-text("Done"), button:has-text("保存"), button:has-text("Save")',

  // ストーリー作成フロー（モバイルUA使用）
  storySectionLabel:
    'text="ストーリーズ", text="Your story", text="Add to story", text="Story", [aria-label*="ストーリー"], [aria-label*="story" i]',
  storyFileInput: 'input[type="file"][accept*="avif"], input[type="file"][accept*="image"]',
  storyShareButton:
    'text="ストーリーズに追加", text="Share to story", text="Share to Story", text="Add to story", text="Your story", button:has-text("ストーリーズに追加"), button:has-text("Share to story"), button:has-text("Share to Story"), button:has-text("Add to story"), button:has-text("シェア"), [role="button"]:has-text("ストーリーズに追加"), [role="button"]:has-text("Share to story")',

  // ストーリーエディタ ── テキストオーバーレイ
  // button._aa3j: IG mobile web 2025-04 の Aa(テキスト)ボタン。aria-label なし、icon-only。
  storyTextToolButton:
    'button._aa3j, [aria-label="テキスト"], [aria-label="Text"], [data-testid="story-text-button"]',
  storyTextConfirmButton:
    'button:has-text("完了"), button:has-text("Done"), [aria-label="完了"], [aria-label="Done"]',

  // ストーリーエディタ ── リンクスティッカー
  // button._aa3h: IG mobile web 2025-04 のスタンプボタン。aria-label なし、icon-only。
  storyStickerButton:
    'button._aa3h, [aria-label="スタンプ"], [aria-label="Sticker"], [aria-label="ステッカー"], [data-testid="story-sticker-button"]',
  storyLinkStickerOption:
    '[aria-label="リンク"], [aria-label="Link"], button:has-text("リンク"), button:has-text("Link"), [data-testid="story-link-sticker"]',
  storyLinkUrlInput:
    'input[placeholder*="URL"], input[placeholder*="url"], input[type="url"], [data-testid="story-link-url-input"]',
  storyLinkTextInput:
    'input[placeholder*="リンクテキスト"], input[placeholder*="Link text"], input[placeholder*="Customize link"], [data-testid="story-link-text-input"]',
  storyLinkDoneButton:
    'button:has-text("完了"), button:has-text("Done"), [aria-label="完了"], [aria-label="Done"]',

  // 状態確認
  profileIcon:
    'a[href="/"], a[href="/reels/"], nav a[href*="/"]',
  rateLimitIndicator:
    'text="しばらくしてから", text="Try Again Later", text="Action Blocked"',
  postSuccessIndicator:
    'text="投稿がシェアされました", text="Your post has been shared"',
} as const;

const BASE_URL = "https://www.instagram.com";
const SESSIONS_DIR = path.resolve(process.env.SESSIONS_DIR ?? "./data/sessions");
const STORY_MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SS_DIR = path.resolve("./data/screenshots");

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
  /** フィード投稿の「リンクを追加」機能で登録するURL（任意） */
  affiliateUrl?: string;
  /** リンクのボタン文言（任意。InstagramのCTAラベル、最大30字程度） */
  affiliateLabel?: string;
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
  /** アフィリエイトリンクURL（スティッカーで貼る URL、任意） */
  affiliateLink?: string;
  /** リンクスティッカーに添えるテキスト（任意） */
  linkText?: string;
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
          await this.page.locator(SELECTORS.newPostButton).first().click();
          await humanDelay(1500, 3000);

          // 新UIではサブメニュー（"Post"/"Live"/"Ad"）が開く。
          // 「Post/投稿」を選択（旧UIでは無くてもfile inputが直接出るため、見つからない場合はスキップ）
          const postMenuItem = await this.page
            .locator(SELECTORS.newPostMenuItemPost)
            .first();
          if (await postMenuItem.count() > 0) {
            await postMenuItem.click({ timeout: 5000 }).catch(() => {});
            await humanDelay(1500, 2500);
          }

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

          // 「リンクを追加」機能で affiliate URL/Label を登録（任意）
          if (opts.affiliateUrl) {
            await this._addPostLink(opts.affiliateUrl, opts.affiliateLabel);
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
  // フィード投稿 ── 「リンクを追加」機能でURL/ラベルを登録
  // =============================================================
  private async _addPostLink(url: string, label?: string): Promise<void> {
    console.log("[instagram] Adding post link...");
    const linkBtn = this.page.locator(SELECTORS.addLinkButton).first();
    if (await linkBtn.count() === 0) {
      console.warn("[instagram] 'Add link' button not found, skipping");
      return;
    }
    try {
      await linkBtn.click({ timeout: 5000 });
      await humanDelay(800, 1500);

      const urlInput = this.page.locator(SELECTORS.addLinkUrlInput).first();
      await urlInput.waitFor({ timeout: 8000 });
      await urlInput.click();
      await urlInput.fill(url);
      await humanDelay(400, 800);

      if (label) {
        const labelInput = this.page.locator(SELECTORS.addLinkLabelInput).first();
        if (await labelInput.count() > 0) {
          await labelInput.click({ timeout: 3000 }).catch(() => {});
          await labelInput.fill(label).catch(() => {});
          await humanDelay(300, 600);
        }
      }

      const doneBtn = this.page.locator(SELECTORS.addLinkDoneButton).first();
      if (await doneBtn.count() > 0) {
        await doneBtn.click().catch(() => {});
      } else {
        await this.page.keyboard.press("Enter");
      }
      await humanDelay(800, 1500);
      console.log("[instagram] Post link added ✓");
    } catch (err) {
      console.warn("[instagram] _addPostLink failed:", err instanceof Error ? err.message : err);
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
  // ストーリーズ投稿（モバイルUA + plain chromium）
  // =============================================================
  async postStory(
    opts: InstagramStoryOptions,
  ): Promise<InstagramStoryResult> {
    if (!opts.imagePath) {
      return { success: false, error: "Image path is required for story" };
    }

    // playwright-extra (stealth) を使わず plain chromium を使う。
    // 理由: stealth プラグインが Instagram のモバイルページ描画を阻害し、
    //       file input が見つからなくなるため。
    // 実証: test-story-direct.mjs で plain chromium + mobile UA が完全動作。
    const sessionFile = path.join(SESSIONS_DIR, `instagram_${this.credentials.username}.json`);
    const headless = this.sessionOpts.headless ?? true;

    const browser = await chromium.launch({
      headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-infobars"],
    });

    const ssPath = (name: string) =>
      path.join(SS_DIR, `${name}-${Date.now()}.png`);
    const screenshot = async (page: Page, name: string) => {
      fs.mkdirSync(SS_DIR, { recursive: true });
      await page.screenshot({ path: ssPath(name) }).catch(() => {});
    };

    const storageState = fs.existsSync(sessionFile)
      ? JSON.parse(fs.readFileSync(sessionFile, "utf8"))
      : undefined;

    const ctx = await browser.newContext({
      userAgent: STORY_MOBILE_UA,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      ...(storageState ? { storageState } : {}),
    });
    const page = await ctx.newPage();

    try {
      // ログイン確認（既存セッションを流用）
      await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await humanDelay(2000, 4000);

      const url = page.url();
      if (url.includes("/accounts/login") || url.includes("/accounts/onetap")) {
        return { success: false, error: "Not logged in — run login() first with desktop session" };
      }

      return await withRetry(
        async () => {
          console.log("[instagram] Starting story post (plain chromium, mobile UI)...");

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

          await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
          await screenshot(page, "ig-story-home-before");

          // モバイルUIのホームページには input[type="file"][accept*="avif"] が存在する。
          // el.click() を先に呼んでユーザー操作をシミュレートしてから setInputFiles() すること。
          // そうしないと Instagram が file input を無視して /create/story/ へ遷移しない。
          console.log("[instagram] Looking for story file input on home page...");
          const allInputs = await page.$$("input[type=\"file\"]");
          console.log(`[instagram] Found ${allInputs.length} file inputs`);

          let fileInput = null;
          for (const inp of allInputs) {
            const accept = await inp.getAttribute("accept");
            if (accept?.includes("avif") || accept?.includes("image")) {
              fileInput = inp;
              break;
            }
          }

          if (!fileInput) {
            const inputsInfo = await page.evaluate(() =>
              Array.from(document.querySelectorAll("input")).map(i => ({
                type: (i as HTMLInputElement).type,
                accept: (i as HTMLInputElement).accept,
              }))
            );
            console.error("[instagram] Available inputs:", JSON.stringify(inputsInfo));
            throw new Error(`Story file input not found. URL=${page.url()}`);
          }

          const resolvedPath = path.resolve(opts.imagePath);
          // 直接 setInputFiles を呼ぶ。test-story-direct.mjs で plain chromium + mobile UA 動作確認済。
          // 注意: el.click() を先に呼ぶと Instagram が file input を無視して遷移しなくなる。
          await fileInput.setInputFiles(resolvedPath);
          await humanDelay(3000, 5000);
          console.log(`[instagram] Attached story image: ${opts.imagePath}`);
          await screenshot(page, "ig-story-image-attached");

          // setInputFiles 後、/create/story/ に遷移するのを待つ
          if (!page.url().includes("/create/story/")) {
            await page.waitForFunction(
              () => location.href.includes("/create/story/"),
              { timeout: 25_000 },
            );
          }
          console.log("[instagram] Story editor opened ✓");
          // エディタの描画完了を待つ（ストーリーズに追加ボタンが表示されるまで ~10s かかる）
          await humanDelay(8000, 12000);
          await screenshot(page, "ig-story-editor-loaded");

          // textOverlay 指定時: テキストオーバーレイを追加
          if (opts.textOverlay) {
            await this._addStoryTextOverlay(page, opts.textOverlay);
            // テキスト確定後にエディタが再描画されるまで待つ
            await humanDelay(2000, 3000);
            await screenshot(page, "ig-story-after-text");
            console.log("[instagram] Post-text URL:", page.url());
          }

          // affiliateLink 指定時: configure_to_story リクエストに story_cta を注入
          // スタンプトレイは headless では canvas レンダリングのためアクセス不可。
          // route interceptor で API レベルでリンクスタンプを追加する。
          if (opts.affiliateLink) {
            await page.route("**/configure_to_story/**", async (route) => {
              const original = route.request().postData() ?? "";
              const params = new URLSearchParams(original);
              params.set(
                "story_cta",
                JSON.stringify([
                  {
                    links: [
                      {
                        linkType: 1,
                        webUri: opts.affiliateLink!,
                        androidClass: "",
                        appInstallObjectStoreUrl: "",
                        callToActionTitle: opts.linkText ?? "",
                      },
                    ],
                  },
                ])
              );
              console.log("[instagram] Injecting story_cta with affiliate link");
              await route.continue({ postData: params.toString() });
            });
          }

          // 「ストーリーズに追加」ボタンをクリック
          // waitForSelector でのカンマ区切り text= セレクタは CSS OR として解釈され
          // text engine が効かないため、セレクタを順に試す
          const shareBtnCandidates = [
            'button._aswp',
            'text="ストーリーズに追加"',
            'button:has-text("ストーリーズに追加")',
            'button:has([aria-label="ストーリーズに追加"])',
            'text="Share to story"',
            'button:has-text("Share to story")',
          ];
          let shareBtn: Awaited<ReturnType<typeof page.waitForSelector>> | null = null;
          const shareBtnDeadline = Date.now() + 60_000;
          while (!shareBtn && Date.now() < shareBtnDeadline) {
            for (const sel of shareBtnCandidates) {
              shareBtn = await page.$(sel).catch(() => null);
              if (shareBtn) { console.log(`[instagram] Share button found: ${sel}`); break; }
            }
            if (!shareBtn) await humanDelay(500, 800);
          }
          if (!shareBtn) throw new Error("Share button not found after 60s");
          await shareBtn.click();
          console.log("[instagram] Clicked share button");

          // アップロード完了の検知
          await Promise.race([
            page.waitForFunction(
              () => !location.href.includes("/create/"),
              { timeout: 60_000 },
            ),
            page.waitForSelector(
              'text="ストーリーズをシェアしました", text="Story shared", text="Your story has been shared"',
              { timeout: 60_000 },
            ).then(() => undefined),
          ]).catch(async () => {
            console.warn("[instagram] Story share completion not detected, navigating home");
            await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
          });
          await humanDelay(1500, 2500);

          // セッション保存
          const state = await ctx.storageState();
          fs.mkdirSync(SESSIONS_DIR, { recursive: true });
          fs.writeFileSync(sessionFile, JSON.stringify(state, null, 2));
          console.log(`[instagram] Session saved: ${sessionFile}`);

          console.log("[instagram] Story posted successfully");
          return { success: true };
        },
        { maxRetries: 2, label: "instagram-story" },
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[instagram] Story post failed: ${errorMessage}`);
      await page.screenshot({ path: ssPath("ig-story-error") }).catch(() => {});
      return { success: false, error: errorMessage };
    } finally {
      await browser.close();
    }
  }

  // =============================================================
  // ストーリーエディタ ── テキストオーバーレイ
  // =============================================================
  private async _addStoryTextOverlay(page: Page, text: string): Promise<void> {
    console.log("[instagram] Adding text overlay...");

    // テキストツール（Aa ボタン）をクリック
    const textBtn = await page.waitForSelector(SELECTORS.storyTextToolButton, {
      timeout: 8_000,
    }).catch(() => null);
    if (!textBtn) {
      console.warn("[instagram] Text tool button not found, skipping textOverlay");
      return;
    }
    await textBtn.click();
    await humanDelay(800, 1500);

    // テキスト入力（フォーカスされた入力欄にそのまま入力）
    await page.keyboard.type(text, { delay: 60 });
    await humanDelay(500, 1000);

    // 完了ボタンをクリックしてテキストを確定
    const confirmBtn = await page.$(SELECTORS.storyTextConfirmButton);
    if (confirmBtn) {
      await confirmBtn.click();
      await humanDelay(800, 1500);
    } else {
      // 完了ボタンが見つからない場合は Enter で確定を試みる
      await page.keyboard.press("Enter");
      await humanDelay(800, 1500);
    }

    // テキスト編集モーダルを確実に閉じるため、画像中央領域をクリックしてフォーカスを外す
    // （これをしないと「ストーリーズに追加」ボタンが背景にあり押せない状態になる）
    try {
      const viewport = page.viewportSize();
      if (viewport) {
        await page.mouse.click(viewport.width / 2, viewport.height / 3);
        await humanDelay(500, 1000);
      }
      await page.keyboard.press("Escape").catch(() => {});
      await humanDelay(300, 600);
    } catch { /* best-effort */ }

    console.log("[instagram] Text overlay added ✓");
  }

  // =============================================================
  // ストーリーエディタ ── アフィリエイトリンクスティッカー
  // =============================================================
  private async _addStoryAffiliateLink(
    page: Page,
    url: string,
    linkText?: string,
  ): Promise<void> {
    console.log("[instagram] Adding affiliate link sticker...");

    // スティッカーアイコン（顔文字マーク）をクリック
    const stickerBtn = await page.waitForSelector(SELECTORS.storyStickerButton, {
      timeout: 8_000,
    }).catch(() => null);
    if (!stickerBtn) {
      console.warn("[instagram] Sticker button not found, skipping affiliateLink");
      return;
    }
    await stickerBtn.click();
    await humanDelay(1000, 2000);

    // スティッカートレイから「リンク」を選択
    const linkSticker = await page.waitForSelector(SELECTORS.storyLinkStickerOption, {
      timeout: 8_000,
    }).catch(() => null);
    if (!linkSticker) {
      console.warn("[instagram] Link sticker option not found, skipping affiliateLink");
      // トレイを閉じるために Escape
      await page.keyboard.press("Escape");
      return;
    }
    await linkSticker.click();
    await humanDelay(800, 1500);

    // URL 入力フィールドにリンクを入力
    const urlInput = await page.waitForSelector(SELECTORS.storyLinkUrlInput, {
      timeout: 8_000,
    }).catch(() => null);
    if (!urlInput) {
      console.warn("[instagram] Link URL input not found, skipping affiliateLink");
      await page.keyboard.press("Escape");
      return;
    }
    await urlInput.click();
    await humanType(page, SELECTORS.storyLinkUrlInput, url);
    await humanDelay(500, 1000);

    // linkText が指定されていればリンクテキストフィールドにも入力
    if (linkText) {
      const textInput = await page.$(SELECTORS.storyLinkTextInput);
      if (textInput) {
        await textInput.click();
        await humanType(page, SELECTORS.storyLinkTextInput, linkText);
        await humanDelay(500, 1000);
      }
    }

    // 完了ボタンでスティッカーを配置
    const doneBtn = await page.waitForSelector(SELECTORS.storyLinkDoneButton, {
      timeout: 8_000,
    }).catch(() => null);
    if (doneBtn) {
      await doneBtn.click();
      await humanDelay(800, 1500);
    } else {
      await page.keyboard.press("Enter");
      await humanDelay(800, 1500);
    }

    console.log("[instagram] Affiliate link sticker added ✓");
  }

  // =============================================================
  // ライフサイクル
  // =============================================================
  async close(): Promise<void> {
    await this.session.saveSession();
    await this.session.close();
  }
}
