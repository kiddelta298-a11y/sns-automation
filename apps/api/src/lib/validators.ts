import { z } from "zod";

// === Accounts ===

export const platformEnum = z.enum(["threads", "x", "instagram"]);

export const createAccountSchema = z.object({
  platform: platformEnum,
  username: z.string().min(1).max(100),
  displayName: z.string().max(200).optional(),
  credentials: z.record(z.unknown()),
  proxyConfig: z.record(z.unknown()).optional(),
});

export const updateAccountSchema = createAccountSchema.partial().extend({
  status: z.enum(["active", "suspended", "rate_limited"]).optional(),
});

// === Posts ===

export const postStatusEnum = z.enum(["draft", "scheduled", "posting", "posted", "failed"]);

export const createPostSchema = z.object({
  accountId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  appealPatternId: z.string().uuid().optional(),
  platform: platformEnum,
  contentText: z.string().optional(),
  linkUrl: z.string().url().max(500).optional(),
  status: postStatusEnum.default("draft"),
  metadata: z.record(z.unknown()).optional(),
});

export const updatePostSchema = z.object({
  contentText: z.string().optional(),
  linkUrl: z.string().url().max(500).optional().nullable(),
  status: postStatusEnum.optional(),
  platformPostId: z.string().max(100).optional(),
  postedAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// === Redirect Links ===

export const createRedirectLinkSchema = z.object({
  postId: z.string().uuid(),
  destinationUrl: z.string().url().max(1000),
  shortCode: z.string().min(1).max(20).optional(),
});

// === Campaigns ===

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  utmCampaign: z.string().min(1).max(100),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  goalRegistrations: z.number().int().positive().optional(),
});

// === Appeal Patterns ===

export const createAppealPatternSchema = z.object({
  name: z.string().min(1).max(200),
  utmTerm: z.string().min(1).max(100),
  description: z.string().optional(),
  templateText: z.string().optional(),
  category: z.enum(["benefit", "urgency", "social_proof", "curiosity"]).optional(),
});

// === Query params ===

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const clickAnalyticsQuerySchema = z.object({
  redirectLinkId: z.string().uuid().optional(),
  postId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// === Industries ===

export const createIndustrySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  keywords: z.array(z.string().min(1)).min(1).max(20),
});

// === Trends ===

export const startCollectionSchema = z.object({
  industryId: z.string().uuid(),
  targetCount: z.number().int().min(100).max(2000).default(500),
  platforms: z.array(z.enum(["threads", "instagram"])).min(1).default(["threads"]),
  instagramAccountId: z.string().uuid().optional(),
});

export const trendRankingQuerySchema = z.object({
  industryId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  metric: z
    .enum(["buzz_score", "engagement_rate", "like_count", "repost_count", "view_count", "hidden_gem"])
    .default("buzz_score"),
  format: z
    .enum(["question", "list", "story", "opinion", "punchline", "other", "all"])
    .default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const analyzeJobSchema = z.object({
  jobId: z.string().uuid(),
});

export const generateDraftsSchema = z.object({
  jobId: z.string().uuid(),
  seed: z.string().max(500).optional(),
  count: z.number().int().min(1).max(10).default(3),
});

export const postDraftSchema = z.object({
  accountId: z.string().uuid(),
  scheduledAt: z.string().datetime().optional(),
});
