import { sql } from "drizzle-orm";
import { spawn } from "node:child_process";
import { ThreadsScraper } from "./threads-scraper.js";
import { ThreadsScraperScrapling } from "./threads-scraper-scrapling.js";
import {
  getConfiguredEngine,
  type IThreadsScraper,
  type ThreadsScraperOptions,
  type ProgressCallback,
  type ThreadsScraperEngine,
} from "./threads-scraper-interface.js";
import { getDb } from "../db/index.js";

// Scrapling が起動可能か簡易チェック（Python+scrapling の import が通るか）
async function isScraplingHealthy(timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const pythonBin = process.env.PYTHON_BIN ?? "python3";
    const proc = spawn(pythonBin, ["-c", "from scrapling.fetchers import StealthyFetcher; print('ok')"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let resolved = false;
    const done = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      try { proc.kill(); } catch { /* noop */ }
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    let stdout = "";
    proc.stdout?.on("data", (d) => { stdout += String(d); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      done(code === 0 && stdout.includes("ok"));
    });
    proc.on("error", () => { clearTimeout(timer); done(false); });
  });
}

function normalizeEngine(raw: string | null | undefined): ThreadsScraperEngine {
  return (raw ?? "").toLowerCase() === "scrapling" ? "scrapling" : "playwright";
}

function getEngineWithFallback(): ThreadsScraperEngine {
  return normalizeEngine(process.env.THREADS_SCRAPER_ENGINE ?? process.env.SCRAPER_ENGINE);
}

// DB の app_settings から動的に取得（UIトグルで切替可能）。
// DB未到達/未設定の場合は env 変数 → "playwright" にフォールバック。
async function resolveEngine(): Promise<ThreadsScraperEngine> {
  try {
    const db = getDb();
    const rows = await db.execute(
      sql`SELECT value FROM app_settings WHERE key = 'threads_scraper_engine' LIMIT 1`,
    );
    const value = (rows as unknown as Array<{ value: string }>)[0]?.value;
    if (value) return normalizeEngine(value);
  } catch {
    // DB接続失敗時は env にフォールバック
  }
  return getEngineWithFallback();
}

export async function createThreadsScraper(
  opts?: ThreadsScraperOptions,
  onProgress?: ProgressCallback,
  engineOverride?: ThreadsScraperEngine,
): Promise<IThreadsScraper> {
  const engine = engineOverride ?? await resolveEngine();
  if (engine === "scrapling") {
    // Scrapling は Python + camoufox の依存があるため、利用前に健全性チェック。
    // 失敗した場合は Playwright に自動フォールバックして UI を「動かない」状態にしない。
    const healthy = await isScraplingHealthy();
    if (!healthy) {
      const msg = "[engine=scrapling] 健全性チェック失敗 → Playwrightにフォールバック (PYTHON_BIN/scrapling/camoufox を確認)";
      if (onProgress) onProgress(msg);
      console.warn(msg);
      return new ThreadsScraper(opts, onProgress);
    }
    if (onProgress) onProgress(`[engine=scrapling] ThreadsScraperScraplingを使用`);
    return new ThreadsScraperScrapling(opts, onProgress);
  }
  if (onProgress) onProgress(`[engine=playwright] ThreadsScraperを使用`);
  return new ThreadsScraper(opts, onProgress);
}

export { getConfiguredEngine, resolveEngine };
export type { IThreadsScraper, ThreadsScraperEngine };
