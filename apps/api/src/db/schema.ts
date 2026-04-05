import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  decimal,
  bigserial,
  date,
  index,
  uniqueIndex,
  boolean,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================
// accounts（アカウント）
// ============================================================
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    platform: varchar("platform", { length: 20 }).notNull(),
    username: varchar("username", { length: 100 }).notNull(),
    displayName: varchar("display_name", { length: 200 }),
    credentials: jsonb("credentials").notNull(),
    proxyConfig: jsonb("proxy_config"),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

export const accountsRelations = relations(accounts, ({ many }) => ({
  posts: many(posts),
  accountMetrics: many(accountMetrics),
}));

// ============================================================
// campaigns（キャンペーン）
// ============================================================
export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  utmCampaign: varchar("utm_campaign", { length: 100 }).unique().notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  goalRegistrations: integer("goal_registrations"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
});

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  posts: many(posts),
  conversionEvents: many(conversionEvents),
}));

// ============================================================
// appeal_patterns（訴求パターン）
// ============================================================
export const appealPatterns = pgTable("appeal_patterns", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  utmTerm: varchar("utm_term", { length: 100 }).unique().notNull(),
  description: text("description"),
  templateText: text("template_text"),
  category: varchar("category", { length: 50 }),
  winRate: decimal("win_rate", { precision: 5, scale: 4 }),
});

export const appealPatternsRelations = relations(appealPatterns, ({ many }) => ({
  posts: many(posts),
}));

// ============================================================
// posts（投稿）
// ============================================================
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id)
      .notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    appealPatternId: uuid("appeal_pattern_id").references(() => appealPatterns.id),
    platform: varchar("platform", { length: 20 }).notNull(),
    contentText: text("content_text"),
    linkUrl: varchar("link_url", { length: 500 }),
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    platformPostId: varchar("platform_post_id", { length: 100 }),
    postedAt: timestamp("posted_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_posts_account_status").on(table.accountId, table.status),
    index("idx_posts_platform_posted").on(table.platform, table.postedAt),
    index("idx_posts_campaign").on(table.campaignId),
  ],
);

export const postsRelations = relations(posts, ({ one, many }) => ({
  account: one(accounts, {
    fields: [posts.accountId],
    references: [accounts.id],
  }),
  campaign: one(campaigns, {
    fields: [posts.campaignId],
    references: [campaigns.id],
  }),
  appealPattern: one(appealPatterns, {
    fields: [posts.appealPatternId],
    references: [appealPatterns.id],
  }),
  postMedia: many(postMedia),
  postMetrics: many(postMetrics),
  redirectLinks: many(redirectLinks),
  conversionEvents: many(conversionEvents),
  scheduledPost: many(scheduledPosts),
}));

// ============================================================
// post_media（投稿メディア）
// ============================================================
export const postMedia = pgTable("post_media", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: uuid("post_id")
    .references(() => posts.id)
    .notNull(),
  mediaType: varchar("media_type", { length: 20 }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  altText: varchar("alt_text", { length: 500 }),
});

export const postMediaRelations = relations(postMedia, ({ one }) => ({
  post: one(posts, {
    fields: [postMedia.postId],
    references: [posts.id],
  }),
}));

// ============================================================
// redirect_links（リダイレクトリンク）
// ============================================================
export const redirectLinks = pgTable(
  "redirect_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .references(() => posts.id)
      .notNull(),
    shortCode: varchar("short_code", { length: 20 }).unique().notNull(),
    destinationUrl: varchar("destination_url", { length: 1000 }).notNull(),
    clickCount: integer("click_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_redirect_links_short_code").on(table.shortCode),
  ],
);

export const redirectLinksRelations = relations(redirectLinks, ({ one, many }) => ({
  post: one(posts, {
    fields: [redirectLinks.postId],
    references: [posts.id],
  }),
  clickEvents: many(clickEvents),
}));

// ============================================================
// click_events（クリックイベント）
// ============================================================
export const clickEvents = pgTable(
  "click_events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    redirectLinkId: uuid("redirect_link_id")
      .references(() => redirectLinks.id)
      .notNull(),
    clickedAt: timestamp("clicked_at").defaultNow().notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgent: varchar("user_agent", { length: 500 }),
    referer: varchar("referer", { length: 500 }),
  },
  (table) => [
    index("idx_click_events_link_clicked").on(table.redirectLinkId, table.clickedAt),
    index("idx_click_events_clicked_at").on(table.clickedAt),
  ],
);

export const clickEventsRelations = relations(clickEvents, ({ one }) => ({
  redirectLink: one(redirectLinks, {
    fields: [clickEvents.redirectLinkId],
    references: [redirectLinks.id],
  }),
}));

// ============================================================
// conversion_events（コンバージョンイベント）
// ============================================================
export const conversionEvents = pgTable(
  "conversion_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id").references(() => posts.id),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    utmSource: varchar("utm_source", { length: 50 }),
    utmContent: varchar("utm_content", { length: 100 }),
    utmTerm: varchar("utm_term", { length: 100 }),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("idx_conversion_events_post_type").on(table.postId, table.eventType),
    index("idx_conversion_events_occurred").on(table.occurredAt),
  ],
);

export const conversionEventsRelations = relations(conversionEvents, ({ one }) => ({
  post: one(posts, {
    fields: [conversionEvents.postId],
    references: [posts.id],
  }),
  campaign: one(campaigns, {
    fields: [conversionEvents.campaignId],
    references: [campaigns.id],
  }),
}));

// ============================================================
// post_metrics（投稿メトリクス）
// ============================================================
export const postMetrics = pgTable(
  "post_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .references(() => posts.id)
      .notNull(),
    collectedAt: timestamp("collected_at").defaultNow().notNull(),
    likes: integer("likes").default(0),
    reposts: integer("reposts").default(0),
    replies: integer("replies").default(0),
    views: integer("views").default(0),
    profileVisits: integer("profile_visits"),
  },
  (table) => [
    index("idx_post_metrics_post_collected").on(table.postId, table.collectedAt),
  ],
);

export const postMetricsRelations = relations(postMetrics, ({ one }) => ({
  post: one(posts, {
    fields: [postMetrics.postId],
    references: [posts.id],
  }),
}));

// ============================================================
// scheduled_posts（予約投稿）
// ============================================================
export const scheduledPosts = pgTable(
  "scheduled_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .references(() => posts.id)
      .unique()
      .notNull(),
    scheduledAt: timestamp("scheduled_at").notNull(),
    executedAt: timestamp("executed_at"),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    retryCount: integer("retry_count").default(0),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("idx_scheduled_posts_status_scheduled").on(table.status, table.scheduledAt),
  ],
);

export const scheduledPostsRelations = relations(scheduledPosts, ({ one }) => ({
  post: one(posts, {
    fields: [scheduledPosts.postId],
    references: [posts.id],
  }),
}));

// ============================================================
// account_metrics（アカウントメトリクス）
// ============================================================
export const accountMetrics = pgTable("account_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .references(() => accounts.id)
    .notNull(),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
  followers: integer("followers"),
  following: integer("following"),
  totalPosts: integer("total_posts"),
});

export const accountMetricsRelations = relations(accountMetrics, ({ one }) => ({
  account: one(accounts, {
    fields: [accountMetrics.accountId],
    references: [accounts.id],
  }),
}));

// ============================================================
// app_settings（アプリ設定キーバリューストア）
// ============================================================
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================
// keyword_sets（カスタムキーワードセット）
// ============================================================
export const keywordSets = pgTable("keyword_sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  minKeywordMatch: integer("min_keyword_match").notNull().default(1),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const keywordSetsRelations = relations(keywordSets, ({ many }) => ({
  collectionJobs: many(collectionJobs),
}));

// ============================================================
// industries（業界プリセット）
// ============================================================
export const industries = pgTable("industries", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 50 }).unique().notNull(),
  description: text("description"),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  isPreset: boolean("is_preset").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const industriesRelations = relations(industries, ({ many }) => ({
  collectionJobs: many(collectionJobs),
  trendPosts: many(trendPosts),
  winningPatterns: many(winningPatterns),
}));

// ============================================================
// collection_jobs（収集ジョブ）
// ============================================================
export const collectionJobs = pgTable(
  "collection_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    industryId: uuid("industry_id")
      .references(() => industries.id),
    keywordSetId: uuid("keyword_set_id")
      .references(() => keywordSets.id),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    // pending | running | completed | failed
    targetCount: integer("target_count").default(500).notNull(),
    collectedCount: integer("collected_count").default(0).notNull(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_collection_jobs_industry_status").on(table.industryId, table.status),
    index("idx_collection_jobs_created").on(table.createdAt),
  ],
);

export const collectionJobsRelations = relations(collectionJobs, ({ one, many }) => ({
  industry: one(industries, {
    fields: [collectionJobs.industryId],
    references: [industries.id],
  }),
  keywordSet: one(keywordSets, {
    fields: [collectionJobs.keywordSetId],
    references: [keywordSets.id],
  }),
  trendPosts: many(trendPosts),
  winningPatterns: many(winningPatterns),
  generatedDrafts: many(generatedDrafts),
}));

// ============================================================
// trend_posts（収集したバズ投稿）
// ============================================================
export const trendPosts = pgTable(
  "trend_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .references(() => collectionJobs.id)
      .notNull(),
    industryId: uuid("industry_id")
      .references(() => industries.id),
    keywordSetId: uuid("keyword_set_id")
      .references(() => keywordSets.id),
    // 投稿者情報
    authorUsername: varchar("author_username", { length: 100 }),
    authorFollowers: integer("author_followers"),
    // 投稿内容
    contentText: text("content_text").notNull(),
    hasImage: boolean("has_image").default(false).notNull(),
    // エンゲージメント指標
    likeCount: integer("like_count").default(0).notNull(),
    repostCount: integer("repost_count").default(0).notNull(),
    replyCount: integer("reply_count").default(0).notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    // 算出スコア
    buzzScore: real("buzz_score").default(0).notNull(),
    engagementRate: real("engagement_rate").default(0).notNull(),
    // 分類（Claudeが付与）
    postFormat: varchar("post_format", { length: 30 }),
    // question（問いかけ型）| list（リスト型）| story（体験談型）
    // opinion（主張型）| punchline（オチ型）| other
    charCount: integer("char_count").default(0).notNull(),
    // 投稿時刻（元投稿の）
    postedAt: timestamp("posted_at"),
    collectedAt: timestamp("collected_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_trend_posts_job").on(table.jobId),
    index("idx_trend_posts_industry_buzz").on(table.industryId, table.buzzScore),
    index("idx_trend_posts_industry_collected").on(table.industryId, table.collectedAt),
  ],
);

export const trendPostsRelations = relations(trendPosts, ({ one }) => ({
  job: one(collectionJobs, {
    fields: [trendPosts.jobId],
    references: [collectionJobs.id],
  }),
  industry: one(industries, {
    fields: [trendPosts.industryId],
    references: [industries.id],
  }),
}));

// ============================================================
// winning_patterns（勝ちパターン）
// ============================================================
export const winningPatterns = pgTable(
  "winning_patterns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .references(() => collectionJobs.id)
      .notNull(),
    industryId: uuid("industry_id")
      .references(() => industries.id),
    keywordSetId: uuid("keyword_set_id")
      .references(() => keywordSets.id),
    // Claudeが生成した分析レポート（JSON構造化）
    analysisReport: jsonb("analysis_report").notNull(),
    // トップパターンのサマリー（テキスト）
    summary: text("summary").notNull(),
    // 上位投稿フォーマット分布
    formatDistribution: jsonb("format_distribution").$type<Record<string, number>>(),
    // 最適文字数帯
    optimalCharRange: jsonb("optimal_char_range").$type<{ min: number; max: number }>(),
    // 最適投稿時間帯
    optimalHours: jsonb("optimal_hours").$type<number[]>(),
    // バズしたトップ投稿サンプル（本文リスト）
    topPostSamples: jsonb("top_post_samples").$type<string[]>(),
    sampleCount: integer("sample_count").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_winning_patterns_industry").on(table.industryId),
    index("idx_winning_patterns_job").on(table.jobId),
  ],
);

export const winningPatternsRelations = relations(winningPatterns, ({ one, many }) => ({
  job: one(collectionJobs, {
    fields: [winningPatterns.jobId],
    references: [collectionJobs.id],
  }),
  industry: one(industries, {
    fields: [winningPatterns.industryId],
    references: [industries.id],
  }),
  generatedDrafts: many(generatedDrafts),
}));

// ============================================================
// generated_drafts（AI生成投稿文案）
// ============================================================
export const generatedDrafts = pgTable(
  "generated_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .references(() => collectionJobs.id)
      .notNull(),
    patternId: uuid("pattern_id")
      .references(() => winningPatterns.id),
    contentText: text("content_text").notNull(),
    postFormat: varchar("post_format", { length: 30 }),
    rationale: text("rationale"),
    // draft | approved | posted | rejected
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    // 実際に投稿した場合の紐付け
    postId: uuid("post_id").references(() => posts.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_generated_drafts_job").on(table.jobId),
    index("idx_generated_drafts_status").on(table.status),
  ],
);

export const generatedDraftsRelations = relations(generatedDrafts, ({ one }) => ({
  job: one(collectionJobs, {
    fields: [generatedDrafts.jobId],
    references: [collectionJobs.id],
  }),
  pattern: one(winningPatterns, {
    fields: [generatedDrafts.patternId],
    references: [winningPatterns.id],
  }),
  post: one(posts, {
    fields: [generatedDrafts.postId],
    references: [posts.id],
  }),
}));
