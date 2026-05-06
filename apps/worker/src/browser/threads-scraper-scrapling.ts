import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IThreadsScraper, ScrapeAccountPostsDetailedOpts, ThreadsScraperOptions } from "./threads-scraper-interface.js";
import type { ScrapedPost, ScrapedAccountProfile, ProgressCallback } from "./threads-scraper.js";

const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";
const TIMEOUT_MS = Number(process.env.SCRAPLING_TIMEOUT_MS ?? 300_000);

function getScriptPath(): string {
  if (process.env.PYTHON_SCRAPLING_SCRIPT) return process.env.PYTHON_SCRAPLING_SCRIPT;
  const _dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(_dirname, "../../python/threads_scrapling.py");
}

interface PythonInput {
  action: string;
  [key: string]: unknown;
}

interface PythonResult {
  ok: boolean;
  posts?: RawPost[];
  profile?: RawProfile;
  error?: string;
}

interface RawPost {
  author_username: string | null;
  author_followers: number | null;
  content_text: string;
  has_image: boolean;
  image_urls: string[];
  like_count: number;
  repost_count: number;
  reply_count: number;
  view_count: number;
  posted_at: string | null;
  platform_post_id: string | null;
}

interface RawProfile {
  username: string;
  display_name: string | null;
  bio: string | null;
  followers_count: number | null;
  posts_count: number | null;
  account_created_at: string | null;
  account_age_months: number | null;
}

function mapPost(raw: RawPost): ScrapedPost {
  return {
    authorUsername: raw.author_username,
    authorFollowers: raw.author_followers,
    contentText: raw.content_text,
    hasImage: raw.has_image,
    imageUrls: raw.image_urls,
    likeCount: raw.like_count,
    repostCount: raw.repost_count,
    replyCount: raw.reply_count,
    viewCount: raw.view_count,
    postedAt: raw.posted_at ? new Date(raw.posted_at) : null,
    platformPostId: raw.platform_post_id,
  };
}

function mapProfile(raw: RawProfile): ScrapedAccountProfile {
  return {
    username: raw.username,
    displayName: raw.display_name,
    bio: raw.bio,
    followersCount: raw.followers_count,
    postsCount: raw.posts_count,
    accountCreatedAt: raw.account_created_at,
    accountAgeMonths: raw.account_age_months,
  };
}

export class ThreadsScraperScrapling implements IThreadsScraper {
  private onProgress: ProgressCallback;

  constructor(_opts?: ThreadsScraperOptions, onProgress?: ProgressCallback) {
    this.onProgress = onProgress ?? ((msg) => console.log(`[scrapling] ${msg}`));
  }

  async init(): Promise<void> {}

  async close(): Promise<void> {}

  async login(_username: string, _password: string): Promise<boolean> {
    throw new Error("Scrapling engine: login not supported yet");
  }

  private _runPython(
    input: PythonInput,
    onStderrLine?: (line: string) => void,
  ): Promise<PythonResult> {
    return new Promise((resolve, reject) => {
      const scriptPath = getScriptPath();
      const proc = spawn(PYTHON_BIN, [scriptPath], { stdio: ["pipe", "pipe", "pipe"] });

      const stdoutLines: string[] = [];
      const stderrLines: string[] = [];
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
        reject(new Error(`Scrapling Python timeout after ${TIMEOUT_MS}ms`));
      }, TIMEOUT_MS);

      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => {
        for (const line of chunk.split("\n")) {
          if (line.trim()) stdoutLines.push(line.trim());
        }
      });

      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => {
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          stderrLines.push(trimmed);
          if (trimmed.startsWith("PROGRESS: ")) {
            const msg = trimmed.slice("PROGRESS: ".length);
            this.onProgress(msg);
            onStderrLine?.(msg);
          } else {
            // Pythonの非progress出力（モジュールimportエラー等）も捕捉
            onStderrLine?.(trimmed);
          }
        }
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) return;

        const lastLine = stdoutLines[stdoutLines.length - 1];
        if (!lastLine) {
          // stderrに有用なエラーがあれば内容を含めて報告
          const tailErr = stderrLines.slice(-5).join(" / ");
          reject(new Error(`Scrapling: no output from Python (exit ${code})${tailErr ? ` — stderr: ${tailErr}` : ""}`));
          return;
        }
        try {
          resolve(JSON.parse(lastLine) as PythonResult);
        } catch {
          reject(new Error(`Scrapling: invalid JSON: ${lastLine.slice(0, 200)}`));
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      proc.stdin.write(JSON.stringify(input) + "\n");
      proc.stdin.end();
    });
  }

  async scrapeByKeyword(keyword: string, maxPosts = 50): Promise<ScrapedPost[]> {
    this.onProgress(`[scrapling] 「${keyword}」を検索中...`);
    const res = await this._runPython({ action: "keyword", keyword, max_posts: maxPosts });
    if (!res.ok) throw new Error(`Scrapling scrapeByKeyword: ${res.error}`);
    return (res.posts ?? []).map(mapPost);
  }

  async scrapeForYouFeed(maxPosts = 100): Promise<ScrapedPost[]> {
    this.onProgress("[scrapling] おすすめフィードを収集中...");
    const res = await this._runPython({ action: "for_you_feed", max_posts: maxPosts });
    if (!res.ok) throw new Error(`Scrapling scrapeForYouFeed: ${res.error}`);
    return (res.posts ?? []).map(mapPost);
  }

  async scrapeAccountPosts(username: string, maxPosts = 20): Promise<ScrapedPost[]> {
    this.onProgress(`[scrapling] @${username} の投稿を収集中...`);
    const res = await this._runPython({ action: "account_posts", username, max_posts: maxPosts });
    if (!res.ok) throw new Error(`Scrapling scrapeAccountPosts: ${res.error}`);
    return (res.posts ?? []).map(mapPost);
  }

  async scrapeAccountPostsDetailed(
    username: string,
    targetMatches = 20,
    opts?: ScrapeAccountPostsDetailedOpts,
  ): Promise<ScrapedPost[]> {
    this.onProgress(`[scrapling] @${username} の詳細投稿を収集中...`);
    // Python が stderr に出す `[合致X/Y|処理Z|...]` 形式を解析して onPostScraped を駆動。
    // これにより UI の進捗バーが Scrapling 利用時も更新される。
    const matchProgressRe = /\[合致(\d+)\/(\d+)\|処理(\d+)\]/;
    const res = await this._runPython(
      {
        action: "account_posts_detailed",
        username,
        target_matches: targetMatches,
        max_processed_urls: opts?.maxProcessedUrls ?? 200,
      },
      (line) => {
        const m = matchProgressRe.exec(line);
        if (m && opts?.onPostScraped) {
          const matched = parseInt(m[1], 10);
          const target = parseInt(m[2], 10);
          const processed = parseInt(m[3], 10);
          // _post は Scrapling 経由では1件単位で渡せないので null を渡す。
          // 呼び出し側 (monitor-accounts) は matched/target/processed のみ参照する。
          opts.onPostScraped(matched, target, processed, null, true);
        }
      },
    );
    if (!res.ok) throw new Error(`Scrapling scrapeAccountPostsDetailed: ${res.error}`);
    const posts = (res.posts ?? []).map(mapPost);
    return opts?.matchFilter ? posts.filter(opts.matchFilter) : posts;
  }

  async scrapeAccountProfile(username: string): Promise<ScrapedAccountProfile> {
    this.onProgress(`[scrapling] @${username} のプロフィールを取得中...`);
    const res = await this._runPython({ action: "profile", username });
    if (!res.ok || !res.profile) {
      throw new Error(`Scrapling scrapeAccountProfile: ${res.error ?? "no profile returned"}`);
    }
    return mapProfile(res.profile);
  }
}
