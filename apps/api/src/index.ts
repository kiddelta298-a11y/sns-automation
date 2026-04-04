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

// Redirector (short URL)
app.route("/r", redirectorRouter);

// Start server
const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`SNS Automation API running on http://localhost:${info.port}`);
});

export default app;
