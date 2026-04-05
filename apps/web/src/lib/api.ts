const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---- 型 ----

export interface ApiPost {
  id: string;
  accountId: string;
  platform: string;
  contentText: string | null;
  linkUrl: string | null;
  status: string;
  platformPostId: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
  redirectLinks?: { clickCount: number }[];
  postMetrics?: ApiPostMetrics[];
}

export interface ApiPostMetrics {
  id: string;
  postId: string;
  collectedAt: string;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  views: number | null;
  profileVisits: number | null;
}

export interface ApiAccount {
  id: string;
  platform: string;
  username: string;
  displayName: string | null;
  status: string;
}

// ---- Posts ----

export function getPosts(limit = 50, offset = 0) {
  return apiFetch<ApiPost[]>(`/api/posts?limit=${limit}&offset=${offset}`);
}

export function getPostById(id: string) {
  return apiFetch<ApiPost>(`/api/posts/${id}`);
}

export function createPost(data: {
  accountId: string;
  platform: string;
  contentText: string;
  linkUrl?: string;
  status: string;
  metadata?: Record<string, unknown>;
}) {
  return apiFetch<ApiPost>("/api/posts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---- Accounts ----

export function getAccounts() {
  return apiFetch<ApiAccount[]>("/api/accounts");
}

export function createAccount(data: {
  platform: string;
  username: string;
  displayName?: string;
  credentials: Record<string, string>;
}) {
  return apiFetch<ApiAccount>("/api/accounts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface ApiAccountMetrics {
  account: ApiAccount;
  postStats: { status: string; count: string }[];
  metrics: {
    total_likes?: number;
    total_reposts?: number;
    total_replies?: number;
    total_views?: number;
    avg_likes?: number;
    avg_views?: number;
    posts_with_metrics?: number;
  };
  recentPosts: (ApiPost & { postMetrics: ApiPostMetrics[] })[];
}

export function getAccountMetrics(id: string) {
  return apiFetch<ApiAccountMetrics>(`/api/accounts/${id}/metrics`);
}

export function updateAccount(id: string, data: {
  displayName?: string;
  status?: string;
}) {
  return apiFetch<ApiAccount>(`/api/accounts/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteAccount(id: string) {
  return apiFetch<{ success: boolean }>(`/api/accounts/${id}`, {
    method: "DELETE",
  });
}

export interface ApiScheduledPost {
  id: string;
  postId: string;
  scheduledAt: string;
  executedAt: string | null;
  status: string;
  retryCount: number | null;
  errorMessage: string | null;
  post: ApiPost & { account?: ApiAccount };
}

export function getErrorPosts() {
  return apiFetch<ApiScheduledPost[]>("/api/posts/errors");
}

export function retryPost(postId: string) {
  return apiFetch<{ success: boolean }>(`/api/posts/${postId}/retry`, { method: "POST" });
}

export function getCalendarPosts(from: string, to: string) {
  return apiFetch<ApiScheduledPost[]>(`/api/posts/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export function updatePost(id: string, data: {
  contentText?: string;
  linkUrl?: string;
  status?: string;
}) {
  return apiFetch<ApiPost>(`/api/posts/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deletePost(id: string) {
  return apiFetch<{ message: string }>(`/api/posts/${id}`, {
    method: "DELETE",
  });
}

// ---- Analytics ----

export function getPostAnalytics(postId: string) {
  return apiFetch<{
    post: ApiPost;
    totalClicks: number;
    latestMetrics: ApiPostMetrics | null;
  }>(`/api/analytics/posts/${postId}`);
}

// ---- Industries ----

export interface ApiIndustry {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  keywords: string[];
  isPreset: boolean;
  createdAt: string;
}

export function getIndustries() {
  return apiFetch<ApiIndustry[]>("/api/industries");
}

export function seedIndustries() {
  return apiFetch<{ seeded: number; slugs: string[] }>("/api/industries/seed", { method: "POST" });
}

// ---- Trends ----

export interface ApiCollectionJob {
  id: string;
  industryId: string;
  status: "pending" | "running" | "completed" | "failed";
  targetCount: number;
  collectedCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  industry?: ApiIndustry;
  hasAnalysis?: boolean;
  patternId?: string | null;
}

export interface ApiTrendPost {
  id: string;
  jobId: string;
  industryId: string;
  authorUsername: string | null;
  authorFollowers: number | null;
  contentText: string;
  hasImage: boolean;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  viewCount: number;
  buzzScore: number;
  engagementRate: number;
  postFormat: string | null;
  charCount: number;
  postedAt: string | null;
  collectedAt: string;
}

export interface ApiWinningPattern {
  id: string;
  jobId: string;
  industryId: string;
  analysisReport: {
    summary?: string;
    keyInsights?: string[];
    winningFormats?: { format: string; reason: string; example: string }[];
    hookPatterns?: string[];
    optimalLength?: { min: number; max: number; reason: string };
    contentThemes?: string[];
    avoidPatterns?: string[];
    postingAdvice?: string;
  };
  summary: string;
  formatDistribution: Record<string, number> | null;
  optimalCharRange: { min: number; max: number } | null;
  topPostSamples: string[] | null;
  sampleCount: number;
  createdAt: string;
}

export interface ApiGeneratedDraft {
  id: string;
  jobId: string;
  patternId: string | null;
  contentText: string;
  postFormat: string | null;
  rationale: string | null;
  status: string;
  postId: string | null;
  createdAt: string;
}

export function startCollection(
  industryId: string,
  targetCount = 500,
  platforms: ("threads" | "instagram")[] = ["threads"],
  instagramAccountId?: string,
) {
  return apiFetch<{ jobId: string; status: string }>("/api/trends/collect", {
    method: "POST",
    body: JSON.stringify({ industryId, targetCount, platforms, instagramAccountId }),
  });
}

export function getCollectionJob(jobId: string) {
  return apiFetch<ApiCollectionJob>(`/api/trends/jobs/${jobId}`);
}

export function getCollectionJobs(industryId?: string) {
  const qs = industryId ? `?industryId=${industryId}` : "";
  return apiFetch<ApiCollectionJob[]>(`/api/trends/jobs${qs}`);
}

export function getTrendRanking(params: {
  industryId: string;
  jobId?: string;
  metric?: string;
  format?: string;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  qs.set("industryId", params.industryId);
  if (params.jobId) qs.set("jobId", params.jobId);
  if (params.metric) qs.set("metric", params.metric);
  if (params.format) qs.set("format", params.format);
  if (params.limit) qs.set("limit", String(params.limit));
  return apiFetch<{
    posts: ApiTrendPost[];
    formatDistribution: { format: string | null; count: number; avgBuzz: number }[];
  }>(`/api/trends/ranking?${qs}`);
}

export function analyzeJob(jobId: string) {
  return apiFetch<{ patternId: string; summary: string }>("/api/trends/analyze", {
    method: "POST",
    body: JSON.stringify({ jobId }),
  });
}

export function getWinningPattern(jobId: string) {
  return apiFetch<ApiWinningPattern>(`/api/trends/patterns/${jobId}`);
}

export function generateDrafts(jobId: string, seed?: string, count = 3) {
  return apiFetch<{ drafts: ApiGeneratedDraft[] }>("/api/trends/generate", {
    method: "POST",
    body: JSON.stringify({ jobId, seed, count }),
  });
}

export function getDrafts(jobId?: string) {
  const qs = jobId ? `?jobId=${jobId}` : "";
  return apiFetch<ApiGeneratedDraft[]>(`/api/trends/drafts${qs}`);
}

export function updateDraft(id: string, data: { contentText?: string; status?: string }) {
  return apiFetch<ApiGeneratedDraft>(`/api/trends/drafts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function postDraft(id: string, accountId: string, scheduledAt?: string) {
  return apiFetch<{ postId: string; scheduledAt: string }>(`/api/trends/drafts/${id}/post`, {
    method: "POST",
    body: JSON.stringify({ accountId, scheduledAt }),
  });
}

// ---- Metrics ----

export interface ApiMetrics {
  job: ApiCollectionJob;
  summary: {
    totalPosts: number;
    avgBuzzScore: number;
    avgEngRate: number;
    maxBuzzScore: number;
    avgCharCount: number;
    imagePostPct: number;
    topFormat: string;
    optimalCharMin: number;
    optimalCharMax: number;
  };
  top10: ApiTrendPost[];
  formatStats: { format: string; count: number; pct: number; avgBuzzScore: number; avgEngRate: number }[];
  charBands: { label: string; min: number; max: number; count: number; avgBuzzScore: number; pct: number }[];
  topKeywords: { word: string; count: number; pct: number }[];
  hourStats: { hour: number; count: number; avgBuzz: number }[];
}

export function getMetrics(jobId: string) {
  return apiFetch<ApiMetrics>(`/api/trends/metrics/${jobId}`);
}

// ---- Campaigns ----

export interface ApiCampaign {
  id: string;
  name: string;
  utmCampaign: string;
  startDate: string | null;
  endDate: string | null;
  goalRegistrations: number | null;
  status: string;
  posts?: { id: string }[];
}

export function getCampaigns() {
  return apiFetch<ApiCampaign[]>("/api/campaigns");
}

export function createCampaign(data: {
  name: string;
  utmCampaign: string;
  startDate?: string;
  endDate?: string;
  goalRegistrations?: number;
  status?: string;
}) {
  return apiFetch<ApiCampaign>("/api/campaigns", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCampaign(id: string, data: Partial<{
  name: string;
  startDate: string;
  endDate: string;
  goalRegistrations: number;
  status: string;
}>) {
  return apiFetch<ApiCampaign>(`/api/campaigns/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteCampaign(id: string) {
  return apiFetch<{ success: boolean }>(`/api/campaigns/${id}`, {
    method: "DELETE",
  });
}

// ---- Uploads ----

export function uploadImage(file: File): Promise<{ url: string; filename: string }> {
  const form = new FormData();
  form.append("file", file);
  return fetch(`${API_BASE}/api/uploads`, { method: "POST", body: form }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? `Upload failed ${res.status}`);
    }
    return res.json();
  });
}

// ---- Settings ----

export function getSettings() {
  return apiFetch<Record<string, string>>("/api/settings");
}

export function saveSettings(updates: Record<string, string>) {
  return apiFetch<Record<string, string>>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}
