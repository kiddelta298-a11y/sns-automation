import { chromium as chromiumExtra } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "playwright";
import path from "node:path";
import fs from "node:fs";

// Stealth プラグインを一度だけ登録
chromiumExtra.use(StealthPlugin());

const SESSIONS_DIR = path.resolve(
  process.env.SESSIONS_DIR ?? "./data/sessions",
);

// ── 現実的な Chrome デスクトップ UA プール ────────────────────────────────
const DESKTOP_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
];

// ── 一般的なデスクトップ解像度プール ─────────────────────────────────────
const DESKTOP_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900  },
  { width: 1366, height: 768  },
  { width: 1536, height: 864  },
  { width: 1280, height: 800  },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── ランダム遅延 ────────────────────────────────────────────────────────
export async function humanDelay(minMs = 800, maxMs = 2000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise((r) => setTimeout(r, ms));
}

// ── 人間的タイピング ──────────────────────────────────────────────────────
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await humanDelay(200, 500);
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.floor(Math.random() * 120) + 30 });
  }
}

// ── 自然なマウス移動 + スクロール ─────────────────────────────────────────
export async function humanScroll(page: Page, deltaY = 800): Promise<void> {
  // カーソルをランダムな位置に動かしてから
  const x = 300 + Math.floor(Math.random() * 600);
  const y = 200 + Math.floor(Math.random() * 400);
  await page.mouse.move(x, y, { steps: 3 });
  await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: "smooth" }), deltaY);
}

// ── 指数バックオフ付きリトライ ─────────────────────────────────────────────
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
      console.warn(`[retry] ${label} attempt ${attempt + 1}/${maxRetries} failed, retry in ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ── ブロック検知 ──────────────────────────────────────────────────────────
export async function detectBlock(page: Page): Promise<"captcha" | "login_wall" | "rate_limit" | null> {
  try {
    const url   = page.url();
    const title = await page.title().catch(() => "");
    const body  = await page.locator("body").textContent({ timeout: 3000 }).catch(() => "");

    // ログインウォール（未ログイン状態でのブロック）
    if (url.includes("/login") || url.includes("/accounts/login")) return "login_wall";

    // CAPTCHA（ページ内のJSONデータに"captcha"が含まれるケースを除外するため、
    // DOM要素での検出を優先する）
    const hasCaptchaIframe = await page.locator("iframe[src*='captcha']").count().then(n => n > 0).catch(() => false);
    const hasCaptchaForm = await page.locator("form[action*='captcha'], [id*='captcha'], [class*='captcha']").count().then(n => n > 0).catch(() => false);
    if (
      hasCaptchaIframe ||
      hasCaptchaForm ||
      title.toLowerCase().includes("security check") ||
      title.toLowerCase().includes("captcha") ||
      body?.toLowerCase().includes("security check") ||
      body?.includes("I'm not a robot") ||
      body?.includes("ロボットではありません")
    ) return "captcha";

    // レート制限 / エラー画面
    if (
      title.includes("Something went wrong") ||
      title.includes("エラー") ||
      body?.includes("Try again later") ||
      body?.includes("しばらくしてからもう一度")
    ) return "rate_limit";

    return null;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────

export interface BrowserSessionOptions {
  sessionKey: string;
  headless?: boolean;
  mobile?: boolean;
  proxy?: { server: string; username?: string; password?: string };
  /** 画像・フォント等の不要リソースをブロックして高速化（デフォルト: true） */
  blockResources?: boolean;
}

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;
  private readonly sessionKey: string;
  private readonly headless: boolean;
  private readonly mobile: boolean;
  private readonly proxy?: { server: string; username?: string; password?: string };
  private readonly blockResources: boolean;

  constructor(opts: BrowserSessionOptions) {
    this.sessionKey    = opts.sessionKey;
    this.headless      = opts.headless ?? true;
    this.mobile        = opts.mobile ?? false;
    this.proxy         = opts.proxy;
    this.blockResources = opts.blockResources ?? true;
  }

  private get statePath(): string {
    return path.join(SESSIONS_DIR, `${this.sessionKey}.json`);
  }

  get page(): Page {
    if (!this._page) throw new Error("Browser session not initialized");
    return this._page;
  }

  async init(): Promise<Page> {
    const isDocker = process.env.RENDER === "true" || process.env.DOCKER === "true";

    // playwright-extra（stealth 適用済み）でブラウザ起動
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.browser = await (chromiumExtra as any).launch({
      headless: this.headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-notifications",
        "--disable-infobars",
        ...(isDocker ? [
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer",
          "--single-process",
        ] : []),
      ],
    }) as Browser;

    // セッションごとに UA とビューポートをランダムに選択
    const userAgent = this.mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
      : pickRandom(DESKTOP_USER_AGENTS);

    const viewport = this.mobile
      ? { width: 390, height: 844 }
      : pickRandom(DESKTOP_VIEWPORTS);

    const contextOpts: Parameters<Browser["newContext"]>[0] = {
      userAgent,
      viewport,
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      deviceScaleFactor: this.mobile ? 3 : 1,
      isMobile: this.mobile,
      hasTouch: this.mobile,
      // WebGL / Audio フィンガープリントを一般的な値に固定
      extraHTTPHeaders: {
        "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    };

    if (this.proxy) contextOpts.proxy = this.proxy;

    if (fs.existsSync(this.statePath)) {
      try {
        contextOpts.storageState = this.statePath;
        console.log(`[session] Restored session: ${this.sessionKey}`);
      } catch {
        console.warn("[session] Failed to restore session, starting fresh");
      }
    }

    this.context = await this.browser.newContext(contextOpts);

    // ── リソースブロック（画像・フォント・動画を遮断して高速化） ──
    if (this.blockResources) {
      await this.context.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (["image", "font", "media", "stylesheet"].includes(type)) {
          route.abort().catch(() => {});
        } else {
          route.continue().catch(() => {});
        }
      });
    }

    this._page = await this.context.newPage();

    // navigator.webdriver を undefined に上書き（stealth の補完）
    await this._page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
    });

    return this._page;
  }

  async saveSession(): Promise<void> {
    if (!this.context) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const state = await this.context.storageState();
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
    console.log(`[session] Saved: ${this.sessionKey}`);
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser  = null;
    this._page    = null;
  }

  async screenshot(name: string): Promise<void> {
    if (!this._page) return;
    const dir = path.resolve("./data/screenshots");
    fs.mkdirSync(dir, { recursive: true });
    await this._page.screenshot({ path: path.join(dir, `${name}-${Date.now()}.png`) });
  }
}
