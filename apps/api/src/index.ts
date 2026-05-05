import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { cors } from "hono/cors";

import { postsRouter } from "./routes/posts.js";
import { accountsRouter } from "./routes/accounts.js";
import { redirectLinksRouter } from "./routes/redirect-links.js";
import { analyticsRouter } from "./routes/analytics.js";
import { redirectorRouter } from "./routes/redirector.js";
import { industriesRouter } from "./routes/industries.js";
import { trendsRouter } from "./routes/trends.js";
import { settingsRouter } from "./routes/settings.js";
import { uploadsRouter, serveUpload } from "./routes/uploads.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { keywordSetsRouter } from "./routes/keyword-sets.js";
import { researchRouter } from "./routes/research.js";
import { accountGroupsRouter } from "./routes/account-groups.js";
import { mentorRouter } from "./routes/mentor.js";
import { postHistoryRouter } from "./routes/post-history.js";
import { scheduledPostsRouter } from "./routes/scheduled-posts.js";
import { instagramStoryRouter } from "./routes/instagram-story.js";
import { instagramPostsRouter } from "./routes/instagram-posts.js";
import { scraperEngineRouter } from "./routes/scraper-engine.js";
import { handleError } from "./lib/errors.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("/api/*", cors());

// Error handler
app.onError(handleError);

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// API routes
app.route("/api/posts", postsRouter);
app.route("/api/accounts", accountsRouter);
app.route("/api/redirect-links", redirectLinksRouter);
app.route("/api/analytics", analyticsRouter);
app.route("/api/industries", industriesRouter);
app.route("/api/trends", trendsRouter);
app.route("/api/settings", settingsRouter);
app.route("/api/scraper-engine", scraperEngineRouter);

// Redirector (short URL)
app.route("/r", redirectorRouter);

// Campaigns & UTM
app.route("/api/campaigns", campaignsRouter);

// Custom keyword sets
app.route("/api/keyword-sets", keywordSetsRouter);

// Genre research
app.route("/api/research", researchRouter);

// Account groups & bulk posting
app.route("/api/account-groups", accountGroupsRouter);

// X Mentor (x-mastery-mentor skill)
app.route("/api/mentor", mentorRouter);

// Post history & scheduled posts status
app.route("/api", postHistoryRouter);

// Scheduled posts live / stream / detail
app.route("/api/scheduled-posts", scheduledPostsRouter);

// Instagram story posting
app.route("/api/instagram/story", instagramStoryRouter);

// Instagram feed/story unified posting (folder-driven)
app.route("/api/instagram/posts", instagramPostsRouter);

// Uploads API
app.route("/api/uploads", uploadsRouter);

// Static file serving for uploads
app.get("/uploads/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (filename.includes("..") || filename.includes("/")) {
    return c.json({ error: "Invalid filename" }, 400);
  }
  const response = await serveUpload(filename);
  if (!response) return c.json({ error: "Not found" }, 404);
  return response;
});

// 投稿スクリーンショット配信（サブディレクトリ）
app.get("/uploads/post-screenshots/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (filename.includes("..") || filename.includes("/")) {
    return c.json({ error: "Invalid filename" }, 400);
  }
  const response = await serveUpload(`post-screenshots/${filename}`);
  if (!response) return c.json({ error: "Not found" }, 404);
  return response;
});

// Start server
const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`SNS Automation API running on http://localhost:${info.port}`);
});

export default app;
