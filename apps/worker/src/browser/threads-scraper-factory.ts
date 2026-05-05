import { sql } from "drizzle-orm";
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
    if (onProgress) onProgress(`[engine=scrapling] ThreadsScraperScraplingを使用`);
    return new ThreadsScraperScrapling(opts, onProgress);
  }
  if (onProgress) onProgress(`[engine=playwright] ThreadsScraperを使用`);
  return new ThreadsScraper(opts, onProgress);
}

export { getConfiguredEngine, resolveEngine };
export type { IThreadsScraper, ThreadsScraperEngine };
