import type { ScrapedPost, ScrapedAccountProfile, ProgressCallback } from "./threads-scraper.js";
import type { BrowserSessionOptions } from "./base.js";

export type ThreadsScraperOptions = Partial<BrowserSessionOptions> & { username?: string };

export interface ScrapeAccountPostsDetailedOpts {
  postDelayMs?: [number, number];
  matchFilter?: (post: ScrapedPost) => boolean;
  onPostScraped?: (
    matchedCount: number,
    targetCount: number,
    processedCount: number,
    post: ScrapedPost | null,
    isMatch: boolean,
  ) => void;
  maxProcessedUrls?: number;
}

export interface IThreadsScraper {
  init(): Promise<void>;
  close(): Promise<void>;
  login(username: string, password: string): Promise<boolean>;
  scrapeByKeyword(keyword: string, maxPosts?: number): Promise<ScrapedPost[]>;
  scrapeForYouFeed(maxPosts?: number): Promise<ScrapedPost[]>;
  scrapeAccountPosts(username: string, maxPosts?: number): Promise<ScrapedPost[]>;
  scrapeAccountPostsDetailed(
    username: string,
    targetMatches?: number,
    opts?: ScrapeAccountPostsDetailedOpts,
  ): Promise<ScrapedPost[]>;
  scrapeAccountProfile(username: string): Promise<ScrapedAccountProfile>;
}

export type ThreadsScraperEngine = "playwright" | "scrapling";

export function getConfiguredEngine(): ThreadsScraperEngine {
  const raw = (process.env.THREADS_SCRAPER_ENGINE ?? "playwright").toLowerCase();
  return raw === "scrapling" ? "scrapling" : "playwright";
}

export type { ScrapedPost, ScrapedAccountProfile, ProgressCallback };
