import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import path from "node:path";
import fs from "node:fs";

const SESSIONS_DIR = path.resolve(
  process.env.SESSIONS_DIR ?? "./data/sessions",
);

/**
 * ランダムな遅延を挿入する（人間的な操作間隔）
 */
export async function humanDelay(
  minMs = 800,
  maxMs = 2500,
): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * 人間的なタイピングを模倣する
 */
export async function humanType(
  page: Page,
  selector: string,
  text: string,
): Promise<void> {
  await page.click(selector);
  await humanDelay(200, 500);
  for (const char of text) {
    await page.keyboard.type(char, {
      delay: Math.floor(Math.random() * 120) + 30,
    });
  }
}

/**
 * 指数バックオフ付きリトライ
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, label = "operation" } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(
        `[retry] ${label} attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

export interface BrowserSessionOptions {
  /** セッション識別キー（アカウント名など） */
  sessionKey: string;
  /** ヘッドレスモード（デフォルト: true） */
  headless?: boolean;
  /** モバイルUA/ビューポートを使用（ストーリー投稿などに使用） */
  mobile?: boolean;
  /** プロキシ設定 */
  proxy?: { server: string; username?: string; password?: string };
}

/**
 * ブラウザセッションを管理するベースクラス
 * Cookie / StorageState を永続化して再ログイン頻度を下げる
 */
export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;
  private readonly sessionKey: string;
  private readonly headless: boolean;
  private readonly mobile: boolean;
  private readonly proxy?: { server: string; username?: string; password?: string };

  constructor(opts: BrowserSessionOptions) {
    this.sessionKey = opts.sessionKey;
    this.headless = opts.headless ?? true;
    this.mobile = opts.mobile ?? false;
    this.proxy = opts.proxy;
  }

  /** 保存済みセッションファイルのパス */
  private get statePath(): string {
    return path.join(SESSIONS_DIR, `${this.sessionKey}.json`);
  }

  /** 現在のページを取得 */
  get page(): Page {
    if (!this._page) throw new Error("Browser session not initialized");
    return this._page;
  }

  /**
   * ブラウザを起動し、保存済みセッションがあれば復元する
   */
  async init(): Promise<Page> {
    // Docker / Render 環境では /dev/shm が 64MB しかないため
    // --disable-dev-shm-usage で通常メモリにフォールバックさせる（必須）
    const isDocker = process.env.RENDER === "true" || process.env.DOCKER === "true";
    this.browser = await chromium.launch({
      headless: this.headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        ...(isDocker ? [
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer",
          "--single-process",           // メモリ節約（512MB 制限対策）
        ] : []),
      ],
    });

    const contextOpts: Parameters<Browser["newContext"]>[0] = this.mobile
      ? {
          // iPhone 15 相当のモバイル設定（ストーリー投稿用）
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
          locale: "ja-JP",
          timezoneId: "Asia/Tokyo",
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        }
      : {
          viewport: { width: 1280, height: 720 },
          locale: "ja-JP",
          timezoneId: "Asia/Tokyo",
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        };

    if (this.proxy) {
      contextOpts.proxy = this.proxy;
    }

    // 保存済みセッションの復元
    if (fs.existsSync(this.statePath)) {
      try {
        contextOpts.storageState = this.statePath;
        console.log(`[session] Restored session from ${this.statePath}`);
      } catch {
        console.warn("[session] Failed to restore session, starting fresh");
      }
    }

    this.context = await this.browser.newContext(contextOpts);
    this._page = await this.context.newPage();
    return this._page;
  }

  /**
   * セッションを保存する（Cookie + LocalStorage）
   */
  async saveSession(): Promise<void> {
    if (!this.context) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const state = await this.context.storageState();
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
    console.log(`[session] Saved session to ${this.statePath}`);
  }

  /**
   * ブラウザを閉じる（セッションは保存済み前提）
   */
  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
    this._page = null;
  }

  /**
   * スクリーンショットを撮る（デバッグ用）
   */
  async screenshot(name: string): Promise<void> {
    if (!this._page) return;
    const dir = path.resolve("./data/screenshots");
    fs.mkdirSync(dir, { recursive: true });
    await this._page.screenshot({
      path: path.join(dir, `${name}-${Date.now()}.png`),
    });
  }
}
