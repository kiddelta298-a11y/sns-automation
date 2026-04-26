import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BrowserSession,
  humanDelay,
  humanType,
  withRetry,
  type BrowserSessionOptions,
} from "./base.js";
import type { Page, Locator, Frame, Response as PWResponse } from "playwright";

// ---------------------------------------------------------------
// Threads セレクタ（UI 変更時はここだけ修正）
// ---------------------------------------------------------------
const SELECTORS = {
  // ログイン（threads.com の Instagram 埋め込みフォーム）
  loginUsernameInput: 'input[autocomplete="username"]',
  loginPasswordInput: 'input[type="password"]',
  loginNotNowButton: 'text="後で"',
  loginSaveInfoNotNow: 'text="情報を保存しない"',

  // 投稿
  postTextarea:
    '[data-lexical-editor="true"], [contenteditable="true"][role="textbox"], div[contenteditable="true"], [role="dialog"] [contenteditable="true"]',
  attachImageButton: 'input[type="file"]',

  // 状態確認
  profileIcon: '[aria-label="作成"], [aria-label="Create"], [aria-label="プロフィール"], [aria-label="Profile"]',
  rateLimitIndicator: 'text="しばらくしてから"',
} as const;

// apps/data/uploads/post-screenshots に書き込み（API の serveUpload と同じ場所）
// __dirname 相当: apps/worker/src/browser/ → ../../../data/uploads/post-screenshots → apps/data/uploads/post-screenshots
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, "../../../data/uploads/post-screenshots");

// Threads のベース URL
const BASE_URL = "https://www.threads.com";

// ---------------------------------------------------------------
// 投稿テキストから外部リンクを除去する
// ---------------------------------------------------------------
// 抽出した他社投稿には外部URLが含まれることがあり、そのまま投稿すると
// 自アカウントから他社サイトへトラフィックを流してしまう。
// http(s) URL とスキームレスな www. URL を削除し、空白を圧縮する。
export function stripExternalLinks(text: string): string {
  if (!text) return text;
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/(^|[\s(])www\.\S+/gi, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ---------------------------------------------------------------
// GraphQL レスポンスから platformPostId (code) を抽出するヘルパー
// ---------------------------------------------------------------

/**
 * Threads GraphQL / REST API レスポンス JSON から投稿 code を抽出する。
 * 優先度付き既知パスを先に探索し、ヒットしなければ深さ制限付き再帰探索にフォールバック。
 */
function extractPostIdFromGraphQL(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;

  const dig = (root: unknown, ...keys: string[]): unknown => {
    let cur = root;
    for (const k of keys) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[k];
    }
    return cur;
  };

  const isCode = (v: unknown): v is string =>
    typeof v === "string" && v.length >= 5 && /^[A-Za-z0-9_-]+$/.test(v);

  // 優先度付き既知パス（code を最優先。code は Threads 公開 URL の末尾と一致）
  const priorityPaths: unknown[] = [
    dig(json, "data", "create_text_post", "post", "code"),
    dig(json, "data", "thread_create", "code"),
    dig(json, "data", "thread_create", "post", "code"),
    dig(json, "media", "code"),
    dig(json, "data", "media", "code"),
    dig(json, "root_post", "code"),
    dig(json, "post", "code"),
    dig(json, "shortcode"),
    dig(json, "media", "pk_id"),
    dig(json, "media", "id"),
    dig(json, "pk_id"),
    dig(json, "pk"),
  ];
  for (const v of priorityPaths) {
    if (isCode(v)) return v;
  }

  // 深さ制限付き再帰探索（code/shortcode/pk_id/id/pk フィールドを探す）
  const recurse = (node: unknown, depth: number): string | undefined => {
    if (depth > 4 || node == null || typeof node !== "object") return undefined;
    const obj = node as Record<string, unknown>;
    for (const key of ["code", "shortcode", "pk_id", "id", "pk"]) {
      if (isCode(obj[key])) return obj[key] as string;
    }
    for (const val of Object.values(obj)) {
      const found = recurse(val, depth + 1);
      if (found) return found;
    }
    return undefined;
  };

  return recurse(json, 0);
}

// ---------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------
export interface ThreadsCredentials {
  username: string;
  password: string;
}

export interface ThreadsPostOptions {
  text: string;
  imagePaths?: string[];
  /** scheduled_posts.id — スクリーンショットのファイル名に使用 */
  scheduledId?: string;
}

export interface ThreadsPostResult {
  success: boolean;
  postUrl?: string;
  /** 投稿後 URL から抽出したプラットフォーム側の投稿 ID */
  platformPostId?: string;
  error?: string;
  /** 保存したスクリーンショットの URL パス（/uploads/post-screenshots/xxx.png） */
  screenshotPath?: string;
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

  async init(): Promise<void> {
    await this.session.init();
  }

  private get page(): Page {
    return this.session.page;
  }

  /** 現在のセッション情報（cookies等）をJSONオブジェクトで取得 */
  async getStorageState(): Promise<Record<string, unknown>> {
    return this.session.getStorageState();
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
      const profileEl = await this.page.$(SELECTORS.profileIcon);
      return profileEl !== null;
    } catch {
      return false;
    }
  }

  async login(): Promise<void> {
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

        await humanType(
          this.page,
          SELECTORS.loginUsernameInput,
          this.credentials.username,
        );
        await humanDelay(500, 1000);

        await humanType(
          this.page,
          SELECTORS.loginPasswordInput,
          this.credentials.password,
        );
        await humanDelay(500, 1200);

        await this.page.keyboard.press("Enter");
        await humanDelay(5000, 8000);

        const saveInfoBtn = await this.page.$(SELECTORS.loginSaveInfoNotNow);
        if (saveInfoBtn) {
          await saveInfoBtn.click();
          await humanDelay(1000, 2000);
        }

        const notNowBtn = await this.page.$(SELECTORS.loginNotNowButton);
        if (notNowBtn) {
          await notNowBtn.click();
          await humanDelay(1000, 2000);
        }

        await this.page.waitForSelector(SELECTORS.profileIcon, {
          timeout: 20_000,
        });
        console.log("[threads] Login successful");

        await this.session.saveSession();
      },
      { maxRetries: 2, label: "threads-login" },
    );
  }

  // =============================================================
  // 投稿
  // =============================================================
  async post(
    opts: ThreadsPostOptions,
    onStageProgress?: (stage: string, pct: number) => Promise<void>,
  ): Promise<ThreadsPostResult> {
    try {
      if (!(await this.isLoggedIn())) {
        await this.login();
      }

      // クリック前ステップ（idempotent）のみ withRetry で包む。
      // publish クリック以降は idempotent ではないため絶対に再試行しない
      // （Threads 側に投稿が確定済みのまま例外で再試行すると二重投稿になる）。
      const sanitizedText = stripExternalLinks(opts.text);
      if (sanitizedText !== opts.text) {
        console.log("[threads] external links stripped from post text");
      }
      if (!sanitizedText) {
        return { success: false, error: "Post text is empty after stripping external links" };
      }

      await withRetry(
        async () => {
          await this.checkRateLimit();

          console.log("[threads] Starting post...");

          await this.page.goto(`${BASE_URL}/`, {
            waitUntil: "domcontentloaded",
            timeout: 15_000,
          });
          await humanDelay(2000, 3500);

          // 新規投稿ボタン（フォールバック付き）
          await this.clickNewPostButton();
          await humanDelay(1500, 3000);

          // テキスト入力エリア待機
          await this.page.waitForSelector(SELECTORS.postTextarea, {
            timeout: 30_000,
          });
          await humanType(this.page, SELECTORS.postTextarea, sanitizedText);
          await humanDelay(800, 1500);

          if (opts.imagePaths && opts.imagePaths.length > 0) {
            await this.attachImages(opts.imagePaths);
          }

          await humanDelay(1000, 2500);
          await onStageProgress?.("compose", 50);
        },
        { maxRetries: 2, label: "threads-pre-publish" },
      );

      // ----- ここから先は1回のみ。失敗しても再試行しない -----
      await onStageProgress?.("publish", 75);

      // publish クリック前に response / nav リスナーを設置
      let capturedPostUrl: string | undefined;
      let capturedPostId: string | undefined;

      const captureFromResponse = (resp: PWResponse) => {
        if (capturedPostId) return;
        const url = resp.url();
        if (resp.request().method() !== "POST") return;
        if (!/graphql|\/api\/v1\/media|\/api\/v1\/posts|\/api\/.*\/publish/i.test(url)) return;
        void resp.json().then((json: unknown) => {
          if (capturedPostId) return;
          const id = extractPostIdFromGraphQL(json);
          if (id) {
            capturedPostId = id;
            console.log(`[threads] platformPostId captured via GraphQL: ${id}`);
          }
        }).catch(() => {});
      };

      const captureNav = (frame: Frame) => {
        const url = frame.url();
        if (/\/post\//.test(url)) capturedPostUrl = url;
      };

      this.page.on("response", captureFromResponse);
      this.page.on("framenavigated", captureNav);

      let publishClicked = false;
      try {
        await this.clickPublishButton();
        publishClicked = true;
        await this.page.waitForURL(/\/post\//, { timeout: 8_000 }).catch(() => {});
        if (this.page.url().includes("/post/")) capturedPostUrl = this.page.url();
      } catch (err) {
        this.page.off("response", captureFromResponse);
        this.page.off("framenavigated", captureNav);
        // クリック自体が失敗 → 投稿は確定していないので素直に失敗を返す
        if (!publishClicked) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[threads] Publish click failed: ${errorMessage}`);
          await this.takeScreenshot(`error-${opts.scheduledId ?? String(Date.now())}`);
          return { success: false, error: errorMessage };
        }
        // クリック後の例外は投稿確定済みの可能性があるので例外を握りつぶし、後続の確認に進む
        console.warn(`[threads] Post-click exception ignored (post may have succeeded):`, err);
      }
      this.page.off("response", captureFromResponse);
      this.page.off("framenavigated", captureNav);

      await humanDelay(1000, 2000);

      const { url: postUrl, platformPostId } = await this.tryGetPostUrl(
        capturedPostUrl,
        capturedPostId,
      );

      await this.session.saveSession().catch(() => {});

      const screenshotPath = opts.scheduledId
        ? await this.takeScreenshot(opts.scheduledId).catch(() => undefined)
        : undefined;

      console.log("[threads] Post successful");
      return { success: true, postUrl, platformPostId, screenshotPath };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[threads] Post failed: ${errorMessage}`);
      const errorScreenshotName = `error-${opts.scheduledId ?? String(Date.now())}`;
      await this.takeScreenshot(errorScreenshotName);
      return { success: false, error: errorMessage };
    }
  }

  // =============================================================
  // プライベートヘルパー
  // =============================================================

  /**
   * 複数のロケーター候補を順に試してクリックする。
   * 全候補が失敗した場合はスクリーンショットを保存してエラーを投げる。
   */
  private async clickFirstAvailable(
    candidates: Locator[],
    errorMessage: string,
    useLast = false,
  ): Promise<void> {
    for (const candidate of candidates) {
      try {
        const count = await candidate.count();
        if (count > 0) {
          const target = useLast ? candidate.last() : candidate.first();
          await target.click({ timeout: 5000 });
          return;
        }
      } catch { /* 次の候補へ */ }
    }

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await this.page.screenshot({
      path: path.join(SCREENSHOT_DIR, `error-${Date.now()}.png`),
    });
    throw new Error(errorMessage);
  }

  /**
   * 新規投稿ボタンをクリック（フォールバック付き）
   */
  private async clickNewPostButton(): Promise<void> {
    await this.clickFirstAvailable(
      [
        this.page.locator('[aria-label="作成"]'),
        this.page.locator('[aria-label="Create"]'),
        this.page.locator('[aria-label="新規投稿"]'),
        this.page.locator('[aria-label="New post"]'),
        this.page.locator('a, button, div[role="button"]').filter({ hasText: /^作成$/ }),
        this.page.locator('a, button, div[role="button"]').filter({ hasText: /^Create$/ }),
      ],
      "New post button not found",
    );
  }

  /**
   * 投稿モーダル内の Publish/Post/投稿 ボタンをクリック（フォールバック付き）
   *
   * dialog スコープ（最優先）→ フルページ（モーダルは末尾のため last）の順に試す。
   */
  private async clickPublishButton(): Promise<void> {
    // dialog スコープ
    const dialogCandidates: Locator[] = [
      this.page.getByRole("dialog").getByRole("button", { name: /^投稿$/ }),
      this.page.getByRole("dialog").getByRole("button", { name: /^Post$/ }),
      this.page.getByRole("dialog").getByRole("button", { name: /^Publish$/ }),
    ];

    for (const candidate of dialogCandidates) {
      try {
        const count = await candidate.count();
        if (count > 0) {
          await candidate.first().click({ timeout: 5000 });
          return;
        }
      } catch { /* 次の候補へ */ }
    }

    // フルページフォールバック（モーダルボタンは DOM の末尾）
    await this.clickFirstAvailable(
      [
        this.page.locator("div[role='button']").filter({ hasText: /^投稿$/ }),
        this.page.locator("div[role='button']").filter({ hasText: /^Post$/ }),
        this.page.locator("div[role='button']").filter({ hasText: /^Publish$/ }),
        this.page.locator("button").filter({ hasText: /^Post$/ }),
        this.page.locator("button").filter({ hasText: /^投稿$/ }),
        this.page.locator("[aria-label='Post']"),
        this.page.locator("[aria-label*='post' i]"),
      ],
      "Publish button not found in compose modal",
      true, // useLast: モーダルは末尾
    );
  }

  private async attachImages(imagePaths: string[]): Promise<void> {
    const fileInput = await this.page.$(SELECTORS.attachImageButton);
    if (!fileInput) {
      throw new Error("Image upload input not found");
    }

    const resolvedPaths = imagePaths.map((p) => path.resolve(p));
    await fileInput.setInputFiles(resolvedPaths);
    await humanDelay(3000, 5000);
    console.log(`[threads] Attached ${imagePaths.length} image(s)`);
  }

  /**
   * 投稿後の platformPostId を取得する4層フォールバック。
   *  0. GraphQL/REST レスポンス傍受で取得済みの ID（最優先）
   *  1. framenavigated で捕捉済みの /post/ URL
   *  2. 現在の page.url()
   *  3. プロフィールページ再訪問（DOM + window グローバル変数）
   */
  private async tryGetPostUrl(
    capturedUrl?: string,
    capturedPostId?: string,
  ): Promise<{ url?: string; platformPostId?: string }> {
    const extractId = (url: string) =>
      /\/post\/([A-Za-z0-9_-]+)/.exec(url)?.[1];

    // 戦略0: GraphQL 傍受で既に取得済み（URL が取れていれば一緒に返す）
    if (capturedPostId) {
      const url = capturedUrl ?? undefined;
      return { url, platformPostId: capturedPostId };
    }

    // 戦略1: nav リスナーで捕捉済みの /post/ URL
    if (capturedUrl) {
      const platformPostId = extractId(capturedUrl);
      if (platformPostId) {
        console.log(`[threads] platformPostId via nav listener: ${platformPostId}`);
        return { url: capturedUrl, platformPostId };
      }
    }

    // 戦略2: 現在の page URL
    try {
      const url = this.page.url();
      if (url.includes("/post/") || url.includes("/t/")) {
        const platformPostId = extractId(url);
        return { url, platformPostId };
      }
    } catch { /* continue */ }

    // 戦略3: プロフィールページ再訪問（DOM + window グローバル変数）
    try {
      console.log("[threads] Falling back to profile page for platformPostId");
      await this.page.goto(
        `${BASE_URL}/@${this.credentials.username}`,
        { waitUntil: "domcontentloaded", timeout: 10_000 },
      );
      // networkidle まで待って JS レンダリングを待機
      await this.page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      // a[href*="/post/"] が DOM に現れるまで待機
      await this.page.waitForSelector('a[href*="/post/"]', { timeout: 10_000 }).catch(() => {});

      const firstLink = await this.page.$('a[href*="/post/"]');
      if (firstLink) {
        const href = (await firstLink.getAttribute("href")) ?? "";
        const platformPostId = extractId(href);
        const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
        console.log(`[threads] platformPostId via profile DOM: ${platformPostId}`);
        return { url, platformPostId };
      }

      // DOM に見つからない場合は window グローバル変数（Apollo cache / __INITIAL_DATA__）を探索
      const idFromWindow = await this.page.evaluate((): string | null => {
        try {
          const w = window as unknown as Record<string, unknown>;
          const data = w["__INITIAL_DATA__"] ?? w["__RELAY_STORE__"] ?? {};
          const json = JSON.stringify(data);
          const match = /\"code\":\"([A-Za-z0-9_-]{10,20})\"/.exec(json);
          return match?.[1] ?? null;
        } catch {
          return null;
        }
      }).catch(() => null);

      if (idFromWindow) {
        console.log(`[threads] platformPostId via window globals: ${idFromWindow}`);
        return { platformPostId: idFromWindow };
      }
    } catch (e) {
      console.warn("[threads] Profile page fallback failed:", e);
    }

    return {};
  }

  private async checkRateLimit(): Promise<void> {
    const rateLimited = await this.page.$(SELECTORS.rateLimitIndicator);
    if (rateLimited) {
      throw new Error("Rate limited by Threads — try again later");
    }
  }

  /** スクリーンショットを保存し URL パスを返す（失敗時は undefined） */
  private async takeScreenshot(name: string): Promise<string | undefined> {
    try {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const filename = `${name}.png`;
      await this.page.screenshot({ path: path.join(SCREENSHOT_DIR, filename) });
      return `/uploads/post-screenshots/${filename}`;
    } catch {
      return undefined;
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
