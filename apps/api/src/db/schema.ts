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
    affiliateUrl: text("affiliate_url"),
    affiliateLabel: varchar("affiliate_label", { length: 60 }),
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
    progressPct: integer("progress_pct").default(0),
    currentStage: varchar("current_stage", { length: 50 }).default("pending"),
    startedAt: timestamp("started_at"),
    screenshotPath: varchar("screenshot_path", { length: 500 }),
    platformPostId: varchar("platform_post_id", { length: 500 }),
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
// post_history（BullMQジョブ実行履歴）
// ============================================================
export const postHistory = pgTable(
  "post_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: text("job_id").notNull(),
    platform: text("platform").notNull(), // 'instagram' | 'threads' | 'x'
    content: text("content"),
    scheduledAt: timestamp("scheduled_at"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    status: text("status").default("pending").notNull(), // 'pending' | 'running' | 'completed' | 'failed'
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_post_history_job_id").on(table.jobId),
    index("idx_post_history_status").on(table.status),
    index("idx_post_history_scheduled_at").on(table.scheduledAt),
  ],
);

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
    // Threads投稿URL（例: /@username/post/XXXX）
    platformPostId: varchar("platform_post_id", { length: 300 }),
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
// buzz_keywords（バズ投稿ナレッジDB: キーワード×業界の累積知見）
// ============================================================
// 各ジョブ分析時に抽出された頻出ワードをここに累積して、
// 業界ごとの「勝ちワード」ランキングを時系列で育てる。PDCA基盤。
export const buzzKeywords = pgTable(
  "buzz_keywords",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    industryId: uuid("industry_id").references(() => industries.id),
    keywordSetId: uuid("keyword_set_id").references(() => keywordSets.id),
    keyword: varchar("keyword", { length: 100 }).notNull(),
    // 登場回数（全ジョブ合算）
    occurrences: integer("occurrences").notNull().default(0),
    // このワードを含むバズ投稿の合計スコア（平均算出の分子）
    totalBuzzScore: real("total_buzz_score").notNull().default(0),
    // このワードが登場したバズ投稿の件数（平均算出の分母）
    postCount: integer("post_count").notNull().default(0),
    // 平均バズスコア（= totalBuzzScore / postCount）
    avgBuzzScore: real("avg_buzz_score").notNull().default(0),
    // このワードを含んだジョブの数
    jobCount: integer("job_count").notNull().default(0),
    // PDCA: 勝ちワード判定スコア (occurrences × avgBuzzScore)
    winScore: real("win_score").notNull().default(0),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uniq_buzz_keyword_industry").on(t.industryId, t.keyword),
    index("idx_buzz_keywords_winscore").on(t.industryId, t.winScore),
    index("idx_buzz_keywords_lastseen").on(t.lastSeenAt),
  ],
);

export const buzzKeywordsRelations = relations(buzzKeywords, ({ one }) => ({
  industry: one(industries, {
    fields: [buzzKeywords.industryId],
    references: [industries.id],
  }),
  keywordSet: one(keywordSets, {
    fields: [buzzKeywords.keywordSetId],
    references: [keywordSets.id],
  }),
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

// ============================================================
// collected_images（収集した画像 + バズ分析）
// ============================================================
export const collectedImages = pgTable(
  "collected_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id").references(() => collectionJobs.id).notNull(),
    keywordSetId: uuid("keyword_set_id").references(() => keywordSets.id),
    keyword: varchar("keyword", { length: 200 }),
    authorUsername: varchar("author_username", { length: 100 }),
    contentText: text("content_text"),
    imageUrl: text("image_url").notNull(),
    localPath: varchar("local_path", { length: 500 }),
    likeCount: integer("like_count").default(0),
    buzzScore: real("buzz_score").default(0),
    /** Gemini Vision によるバズ理由分析 */
    analysisText: text("analysis_text"),
    analyzedAt: timestamp("analyzed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_collected_images_job").on(t.jobId),
    index("idx_collected_images_keyword_set").on(t.keywordSetId),
  ],
);

export const collectedImagesRelations = relations(collectedImages, ({ one }) => ({
  job: one(collectionJobs, {
    fields: [collectedImages.jobId],
    references: [collectionJobs.id],
  }),
  keywordSet: one(keywordSets, {
    fields: [collectedImages.keywordSetId],
    references: [keywordSets.id],
  }),
}));

// ============================================================
// adult_genres（ジャンル別リサーチ）
// ============================================================
export const adultGenres = pgTable("adult_genres", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  /** バズとみなす最低ライン（グループごとに設定） */
  buzzThresholds: jsonb("buzz_thresholds").$type<{
    minLikes: number;
    minViews: number;
    minReplies: number;
    minReposts: number;
  }>().default({ minLikes: 0, minViews: 0, minReplies: 0, minReposts: 0 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const adultGenresRelations = relations(adultGenres, ({ many }) => ({
  referenceAccounts: many(referenceAccounts),
  genreProfiles: many(genreProfiles),
}));

// ============================================================
// reference_accounts（参考アカウント）
// ============================================================
export const referenceAccounts = pgTable("reference_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  genreId: uuid("genre_id").references(() => adultGenres.id, { onDelete: "cascade" }).notNull(),
  username: varchar("username", { length: 100 }).notNull(),
  platform: varchar("platform", { length: 20 }).default("threads").notNull(),
  notes: text("notes"),
  // プロフィール情報（スクレイプ時に更新）
  accountCreatedAt: varchar("account_created_at", { length: 50 }), // "2023年4月" or "April 2023"
  accountAgeMonths: integer("account_age_months"),                  // 開設からの月数
  followersCount: integer("followers_count"),
  bio: text("bio"),
  postsCount: integer("posts_count"),
  lastProfileScrapedAt: timestamp("last_profile_scraped_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const referenceAccountsRelations = relations(referenceAccounts, ({ one, many }) => ({
  genre: one(adultGenres, {
    fields: [referenceAccounts.genreId],
    references: [adultGenres.id],
  }),
  monitoredPosts: many(monitoredPosts),
}));

// ============================================================
// monitored_posts（参考アカウント投稿の時系列追跡）
// ============================================================
export const monitoredPosts = pgTable(
  "monitored_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referenceAccountId: uuid("reference_account_id")
      .references(() => referenceAccounts.id, { onDelete: "cascade" })
      .notNull(),
    genreId: uuid("genre_id")
      .references(() => adultGenres.id, { onDelete: "cascade" })
      .notNull(),
    /** Threadsの投稿URL（例: /@username/post/ABCD） — ユニーク追跡用 */
    platformPostId: varchar("platform_post_id", { length: 300 }),
    contentText: text("content_text").notNull(),
    imageUrls: jsonb("image_urls").$type<string[]>().default([]),
    /** ダウンロード済み画像のローカル絶対パス。自動投稿時に Threads へ添付する元データ。 */
    localImagePaths: jsonb("local_image_paths").$type<string[]>().default([]),
    hasImage: boolean("has_image").default(false).notNull(),
    likeCount: integer("like_count").default(0).notNull(),
    repostCount: integer("repost_count").default(0).notNull(),
    replyCount: integer("reply_count").default(0).notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    buzzScore: real("buzz_score").default(0).notNull(),
    postedAt: timestamp("posted_at"),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSnapshotAt: timestamp("last_snapshot_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_monitored_posts_genre").on(t.genreId),
    index("idx_monitored_posts_account").on(t.referenceAccountId),
    index("idx_monitored_posts_buzz").on(t.genreId, t.buzzScore),
  ],
);

export const monitoredPostsRelations = relations(monitoredPosts, ({ one, many }) => ({
  referenceAccount: one(referenceAccounts, {
    fields: [monitoredPosts.referenceAccountId],
    references: [referenceAccounts.id],
  }),
  genre: one(adultGenres, {
    fields: [monitoredPosts.genreId],
    references: [adultGenres.id],
  }),
  scoreSnapshots: many(postScoreSnapshots),
}));

// ============================================================
// post_score_snapshots（投稿スコアの時系列スナップショット）
// ============================================================
export const postScoreSnapshots = pgTable(
  "post_score_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    monitoredPostId: uuid("monitored_post_id")
      .references(() => monitoredPosts.id, { onDelete: "cascade" })
      .notNull(),
    likeCount: integer("like_count").default(0).notNull(),
    repostCount: integer("repost_count").default(0).notNull(),
    replyCount: integer("reply_count").default(0).notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    buzzScore: real("buzz_score").default(0).notNull(),
    snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_post_score_snapshots_post").on(t.monitoredPostId),
    index("idx_post_score_snapshots_at").on(t.snapshotAt),
  ],
);

export const postScoreSnapshotsRelations = relations(postScoreSnapshots, ({ one }) => ({
  monitoredPost: one(monitoredPosts, {
    fields: [postScoreSnapshots.monitoredPostId],
    references: [monitoredPosts.id],
  }),
}));

// ============================================================
// genre_profiles（Gemini生成プロファイル）
// ============================================================
export const genreProfiles = pgTable("genre_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  genreId: uuid("genre_id").references(() => adultGenres.id, { onDelete: "cascade" }).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  scrapedPostsCount: integer("scraped_posts_count").default(0),
  profileJson: jsonb("profile_json"),
  rawPosts: jsonb("raw_posts"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const genreProfilesRelations = relations(genreProfiles, ({ one }) => ({
  genre: one(adultGenres, {
    fields: [genreProfiles.genreId],
    references: [adultGenres.id],
  }),
}));

// ============================================================
// account_daily_snapshots（参考アカウントの日次メトリクス）
// ============================================================
export const accountDailySnapshots = pgTable(
  "account_daily_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referenceAccountId: uuid("reference_account_id")
      .references(() => referenceAccounts.id, { onDelete: "cascade" })
      .notNull(),
    genreId: uuid("genre_id")
      .references(() => adultGenres.id, { onDelete: "cascade" })
      .notNull(),
    snapshotDate: date("snapshot_date").notNull(),
    followersCount: integer("followers_count"),
    followingCount: integer("following_count"),
    postsCount: integer("posts_count"),
    dailyPostsCount: integer("daily_posts_count").default(0),
    totalLikes: integer("total_likes").default(0),
    totalImpressions: integer("total_impressions").default(0),
    totalReposts: integer("total_reposts").default(0),
    totalReplies: integer("total_replies").default(0),
    engagementRate: real("engagement_rate"),
    topPostBuzzScore: real("top_post_buzz_score"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_account_daily_snapshots_account_date").on(t.referenceAccountId, t.snapshotDate),
    index("idx_account_daily_snapshots_genre_date").on(t.genreId, t.snapshotDate),
    uniqueIndex("idx_account_daily_snapshots_unique").on(t.referenceAccountId, t.snapshotDate),
  ],
);

export const accountDailySnapshotsRelations = relations(accountDailySnapshots, ({ one }) => ({
  referenceAccount: one(referenceAccounts, {
    fields: [accountDailySnapshots.referenceAccountId],
    references: [referenceAccounts.id],
  }),
  genre: one(adultGenres, {
    fields: [accountDailySnapshots.genreId],
    references: [adultGenres.id],
  }),
}));

// ============================================================
// similar_accounts（類似アカウント提案）
// ============================================================
export const similarAccounts = pgTable(
  "similar_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referenceAccountId: uuid("reference_account_id")
      .references(() => referenceAccounts.id, { onDelete: "cascade" })
      .notNull(),
    genreId: uuid("genre_id")
      .references(() => adultGenres.id, { onDelete: "cascade" })
      .notNull(),
    username: varchar("username", { length: 100 }).notNull(),
    platform: varchar("platform", { length: 20 }).default("threads").notNull(),
    followersCount: integer("followers_count"),
    bio: text("bio"),
    similarityScore: real("similarity_score").default(0),
    similarityReason: text("similarity_reason"),
    isAdded: boolean("is_added").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_similar_accounts_genre").on(t.genreId),
    index("idx_similar_accounts_ref").on(t.referenceAccountId),
  ],
);

export const similarAccountsRelations = relations(similarAccounts, ({ one }) => ({
  referenceAccount: one(referenceAccounts, {
    fields: [similarAccounts.referenceAccountId],
    references: [referenceAccounts.id],
  }),
  genre: one(adultGenres, {
    fields: [similarAccounts.genreId],
    references: [adultGenres.id],
  }),
}));

// ============================================================
// account_groups（アカウントグループ — 一括投稿管理）
// ============================================================
export const accountGroups = pgTable("account_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const accountGroupsRelations = relations(accountGroups, ({ many }) => ({
  members: many(accountGroupMembers),
}));

// ============================================================
// account_group_members（グループメンバー）
// ============================================================
export const accountGroupMembers = pgTable(
  "account_group_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .references(() => accountGroups.id, { onDelete: "cascade" })
      .notNull(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_group_members_unique").on(t.groupId, t.accountId),
  ],
);

export const accountGroupMembersRelations = relations(accountGroupMembers, ({ one }) => ({
  group: one(accountGroups, {
    fields: [accountGroupMembers.groupId],
    references: [accountGroups.id],
  }),
  account: one(accounts, {
    fields: [accountGroupMembers.accountId],
    references: [accounts.id],
  }),
}));

// ============================================================
// affiliate_links（アフィリエイト案件マスタ）
// ============================================================
export const affiliateLinks = pgTable(
  "affiliate_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseName: text("case_name").notNull(),
    asp: text("asp").notNull(),
    trackingUrl: text("tracking_url").notNull(),
    shortSlug: text("short_slug").notNull(),
    genre: text("genre"),
    unitPayout: integer("unit_payout"),
    status: text("status").default("active").notNull(),
    memo: text("memo"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_affiliate_links_short_slug").on(t.shortSlug),
    index("idx_affiliate_links_status").on(t.status),
  ],
);

// ============================================================
// story_posts（ストーリー投稿実績ログ）
// ============================================================
export const storyPosts = pgTable(
  "story_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postedAt: timestamp("posted_at").notNull(),
    accountId: uuid("account_id").references(() => accounts.id),
    linkId: uuid("link_id").references(() => affiliateLinks.id),
    sourceBuzzId: text("source_buzz_id"),
    imagePath: text("image_path"),
    caption: text("caption"),
    scheduleId: uuid("schedule_id"),
    note: text("note"),
    expiredAt: timestamp("expired_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_story_posts_posted_at").on(t.postedAt),
    index("idx_story_posts_link_id").on(t.linkId),
  ],
);

export const storyPostsRelations = relations(storyPosts, ({ one }) => ({
  link: one(affiliateLinks, {
    fields: [storyPosts.linkId],
    references: [affiliateLinks.id],
  }),
  account: one(accounts, {
    fields: [storyPosts.accountId],
    references: [accounts.id],
  }),
}));

// ============================================================
// link_clicks（短縮URLクリックログ）
// ============================================================
export const linkClicks = pgTable(
  "link_clicks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    shortSlug: text("short_slug").notNull(),
    clickedAt: timestamp("clicked_at").defaultNow().notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    referer: text("referer"),
    utmSource: text("utm_source"),
    storyPostId: uuid("story_post_id").references(() => storyPosts.id),
  },
  (t) => [
    index("idx_link_clicks_short_slug").on(t.shortSlug),
    index("idx_link_clicks_clicked_at").on(t.clickedAt),
    index("idx_link_clicks_story_post_id").on(t.storyPostId),
  ],
);

// ============================================================
// asp_reports（ASPレポート取込）
// ============================================================
export const aspReports = pgTable(
  "asp_reports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reportDate: date("report_date").notNull(),
    asp: text("asp").notNull(),
    linkId: uuid("link_id").references(() => affiliateLinks.id),
    clicks: integer("clicks").default(0).notNull(),
    cv: integer("cv").default(0).notNull(),
    revenue: integer("revenue").default(0).notNull(),
    rawRow: jsonb("raw_row"),
    importedAt: timestamp("imported_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_asp_reports_unique").on(t.reportDate, t.asp, t.linkId),
    index("idx_asp_reports_link_id").on(t.linkId),
  ],
);

// ============================================================
// asp_name_mapping（ASP案件名マッピング辞書）
// ============================================================
export const aspNameMapping = pgTable(
  "asp_name_mapping",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    asp: text("asp").notNull(),
    rawName: text("raw_name").notNull(),
    linkId: uuid("link_id").references(() => affiliateLinks.id),
  },
  (t) => [
    uniqueIndex("idx_asp_name_mapping_unique").on(t.asp, t.rawName),
  ],
);

export const affiliateLinksRelations = relations(affiliateLinks, ({ many }) => ({
  storyPosts: many(storyPosts),
  aspReports: many(aspReports),
  nameMappings: many(aspNameMapping),
}));
