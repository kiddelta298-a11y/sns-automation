const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = err as { message?: string; error?: string };
    throw new Error(e.message ?? e.error ?? `API error ${res.status}`);
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

export interface ApiProxyConfig {
  server: string;
  username?: string;
  password?: string;
  label?: string;
}

export interface ApiAccount {
  id: string;
  platform: string;
  username: string;
  displayName: string | null;
  status: string;
  hasSession?: boolean;
  proxyConfig?: ApiProxyConfig | null;
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

export function updateAccountProxy(id: string, proxyConfig: ApiProxyConfig | null) {
  return apiFetch<ApiAccount>(`/api/accounts/${id}/proxy`, {
    method: "PUT",
    body: JSON.stringify({ proxyConfig }),
  });
}

export function testAccountProxy(id: string) {
  return apiFetch<{ ok: boolean; ip?: string; error?: string }>(
    `/api/accounts/${id}/proxy/test`,
    { method: "POST" },
  );
}

export function uploadAccountSession(id: string, storageState: Record<string, unknown>) {
  return apiFetch<{ ok: boolean; account: ApiAccount }>(
    `/api/accounts/${id}/session`,
    { method: "POST", body: JSON.stringify({ storageState }) },
  );
}

export function deleteAccountSession(id: string) {
  return apiFetch<{ ok: boolean; account: ApiAccount }>(
    `/api/accounts/${id}/session`,
    { method: "DELETE" },
  );
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

// ---- Scheduled posts status (real-time monitoring) ----

export type ExecStatus = "pending" | "executing" | "completed" | "failed";

export interface ScheduledPostStatusItem {
  id: string;
  postId: string;
  scheduledAt: string;
  executedAt: string | null;
  status: ExecStatus;
  retryCount: number | null;
  errorMessage: string | null;
  post: {
    id: string;
    accountId: string;
    platform: string;
    contentText: string | null;
    account?: { username: string; displayName: string | null } | null;
  };
}

export interface ScheduledPostsStatusResponse {
  items: ScheduledPostStatusItem[];
  generatedAt: string;
}

export function getScheduledPostsStatus(window: { from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  if (window.from) qs.set("from", window.from);
  if (window.to) qs.set("to", window.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<ScheduledPostsStatusResponse>(`/api/scheduled-posts/status${suffix}`);
}

// ---- Scheduled posts: live execution ----

export type LiveStage = "login" | "compose" | "publish" | "done";

export interface ScheduledPostLive {
  id: string;
  postId: string;
  status: string;
  stage: LiveStage;
  progressPct: number;
  screenshotPath: string | null;
  startedAt: string | null;
  scheduledAt: string;
  post: {
    platform: string;
    contentText: string | null;
    account?: { username: string; displayName: string | null } | null;
  };
}

export interface ScheduledPostsLiveResponse {
  items: ScheduledPostLive[];
  generatedAt: string;
}

export function getScheduledPostsLive() {
  return apiFetch<ScheduledPostsLiveResponse>(`/api/scheduled-posts/live`);
}

export interface ScheduledPostScreenshot {
  path: string;
  capturedAt: string;
  stage: LiveStage;
}

export interface ScheduledPostDetail {
  id: string;
  postId: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  stage: LiveStage | null;
  progressPct: number | null;
  retryCount: number | null;
  errorMessage: string | null;
  screenshots: ScheduledPostScreenshot[];
  post: {
    id: string;
    platform: string;
    contentText: string | null;
    linkUrl: string | null;
    platformPostId: string | null;
    attachments?: { url: string; type: "image" | "video" }[];
    account?: { username: string; displayName: string | null } | null;
  };
}

export function getScheduledPostByPostId(postId: string) {
  return apiFetch<ScheduledPostDetail>(`/api/scheduled-posts/${encodeURIComponent(postId)}`);
}

// ---- Post history ----

export interface PostHistoryItem {
  id: string;
  platform: string;
  contentText: string | null;
  status: "posted" | "failed";
  postedAt: string | null;
  scheduledAt: string | null;
  errorMessage: string | null;
  platformPostId: string | null;
  account?: { username: string; displayName: string | null } | null;
}

export interface PostHistoryResponse {
  items: PostHistoryItem[];
  total: number;
}

export interface PostHistoryQuery {
  platform?: string; // "all" | "threads" | "x" | "instagram"
  from?: string;     // ISO
  to?: string;       // ISO
  status?: "all" | "posted" | "failed";
  limit?: number;
  offset?: number;
}

export function getPostHistory(query: PostHistoryQuery = {}) {
  const qs = new URLSearchParams();
  if (query.platform && query.platform !== "all") qs.set("platform", query.platform);
  if (query.from) qs.set("from", query.from);
  if (query.to) qs.set("to", query.to);
  if (query.status && query.status !== "all") qs.set("status", query.status);
  if (query.limit) qs.set("limit", String(query.limit));
  if (query.offset) qs.set("offset", String(query.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<PostHistoryResponse>(`/api/post-history${suffix}`);
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
  /** 収集中のリアルタイム進捗メッセージ（running時のみ） */
  statusMessage?: string | null;
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
  platformPostId: string | null;
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

// ---- Knowledge (PDCA 勝ちワードランキング) ----

export interface ApiBuzzKeyword {
  id: string;
  industryId: string | null;
  keyword: string;
  occurrences: number;
  totalBuzzScore: number;
  postCount: number;
  avgBuzzScore: number;
  jobCount: number;
  winScore: number;
  firstSeenAt: string;
  lastSeenAt: string;
  industry?: ApiIndustry;
}

export function getKnowledge(params: {
  industryId?: string;
  sortBy?: "winScore" | "occurrences" | "avgBuzz" | "recent";
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params.industryId) qs.set("industryId", params.industryId);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.limit) qs.set("limit", String(params.limit));
  return apiFetch<{
    keywords: ApiBuzzKeyword[];
    summary: { totalKeywords: number; totalJobs: number; avgWinScore: number };
  }>(`/api/trends/knowledge?${qs}`);
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

// ---- Keyword Sets ----

export interface ApiKeywordSet {
  id: string;
  name: string;
  keywords: string[];
  minKeywordMatch: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeywordSetDetail extends ApiKeywordSet {
  jobs: ApiCollectionJob[];
}

export function getKeywordSets() {
  return apiFetch<ApiKeywordSet[]>("/api/keyword-sets");
}

export function getKeywordSet(id: string) {
  return apiFetch<ApiKeywordSetDetail>(`/api/keyword-sets/${id}`);
}

export function createKeywordSet(data: {
  name: string;
  keywords: string[];
  minKeywordMatch?: number;
  description?: string;
}) {
  return apiFetch<ApiKeywordSet>("/api/keyword-sets", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateKeywordSet(id: string, data: {
  name?: string;
  keywords?: string[];
  minKeywordMatch?: number;
  description?: string;
}) {
  return apiFetch<ApiKeywordSet>(`/api/keyword-sets/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteKeywordSet(id: string) {
  return apiFetch<{ success: boolean }>(`/api/keyword-sets/${id}`, {
    method: "DELETE",
  });
}

export function startKeywordCollection(id: string, targetCount = 200, periodDays = 7, collectImages = false) {
  return apiFetch<{ jobId: string; status: string }>(`/api/keyword-sets/${id}/collect`, {
    method: "POST",
    body: JSON.stringify({ targetCount, periodDays, collectImages }),
  });
}

// ---- Job SSE stream ----

const SSE_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * SSEで収集ジョブの進捗をリアルタイム受信する
 * @returns cleanup function（unmount時に呼ぶ）
 */
export function subscribeJobProgress(
  jobId: string,
  onUpdate: (job: ApiCollectionJob) => void,
  onEnd: (job: ApiCollectionJob | null) => void,
): () => void {
  const es = new EventSource(`${SSE_BASE}/api/trends/jobs/${jobId}/stream`);

  es.addEventListener("update", (e: MessageEvent) => {
    const job = JSON.parse(e.data as string) as ApiCollectionJob;
    onUpdate(job);
    if (job.status === "completed" || job.status === "failed") {
      es.close();
      onEnd(job);
    }
  });

  es.addEventListener("error", (e: Event) => {
    console.warn("[SSE] error:", e);
    es.close();
    onEnd(null);
  });

  return () => es.close();
}

// ---- Collected Images ----

export interface ApiCollectedImage {
  id: string;
  jobId: string;
  keywordSetId: string | null;
  keyword: string | null;
  authorUsername: string | null;
  contentText: string | null;
  imageUrl: string;
  localPath: string | null;
  likeCount: number | null;
  buzzScore: number | null;
  analysisText: string | null;
  analyzedAt: string | null;
  createdAt: string;
}

export function getCollectedImages(params: { jobId?: string; keywordSetId?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params.jobId) qs.set("jobId", params.jobId);
  if (params.keywordSetId) qs.set("keywordSetId", params.keywordSetId);
  if (params.limit) qs.set("limit", String(params.limit));
  return apiFetch<ApiCollectedImage[]>(`/api/trends/images?${qs}`);
}

export function getKeywordSetJobs(id: string) {
  return apiFetch<ApiCollectionJob[]>(`/api/keyword-sets/${id}/jobs`);
}

export function getKeywordSetJob(jobId: string) {
  return apiFetch<ApiCollectionJob>(`/api/keyword-sets/jobs/${jobId}`);
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

// ---- ジャンル別リサーチ ----

export interface ApiBuzzThresholds {
  minLikes: number;
  minViews: number;
  minReplies: number;
  minReposts: number;
}

export interface ApiAdultGenre {
  id: string;
  name: string;
  description: string | null;
  buzzThresholds?: ApiBuzzThresholds | null;
  createdAt: string;
  accountCount?: number;
  latestProfile?: { status: string; updatedAt: string } | null;
}

export interface ApiReferenceAccount {
  id: string;
  genreId: string;
  username: string;
  platform: string;
  notes: string | null;
  // プロフィール情報（スクレイプ後に設定）
  accountCreatedAt: string | null;
  accountAgeMonths: number | null;
  followersCount: number | null;
  bio: string | null;
  postsCount: number | null;
  lastProfileScrapedAt: string | null;
  createdAt: string;
}

export interface ApiMonitoredPost {
  id: string;
  referenceAccountId: string;
  genreId: string;
  platformPostId: string | null;
  contentText: string;
  imageUrls: string[];
  hasImage: boolean;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  viewCount: number;
  buzzScore: number;
  postedAt: string | null;
  firstSeenAt: string;
  lastSnapshotAt: string;
  // 自動投稿ステータス: API が posts テーブル / scheduled_posts と JOIN して算出する
  postingStatus?: "posted" | "scheduled" | "unposted";
  autoPostedAt?: string | null;
}

export interface ApiPostScoreSnapshot {
  id: string;
  monitoredPostId: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  viewCount: number;
  buzzScore: number;
  snapshotAt: string;
}

export interface ApiGenreProfile {
  id: string;
  genreId: string;
  status: string;
  scrapedPostsCount: number;
  profileJson: {
    genreSummary?: string;
    accountAgeInsights?: {
      newAccountStrategy: string;
      earlyGrowthPattern: string;
      reproducibility: string;
    };
    buzzTriggers?: { trigger: string; mechanism: string; example: string }[];
    imageAnalysis?: {
      bestImageTypes: string[];
      imageCharacteristics: string;
      imageVsNoImage: string;
    };
    imageTextCombos?: { imageType: string; textPattern: string; effectiveness: string }[];
    toneAndStyle?: { description: string; examples: string[] };
    hookPatterns?: { name: string; description: string; example: string }[];
    topicClusters?: string[];
    emojiUsage?: string;
    postStructure?: string;
    callToAction?: string;
    avoidedWords?: string[];
    trendingKeywords?: {
      timeSensitive: string[];
      evergreen: string[];
      risky: string[];
    };
    recommendedKeywords?: string[];
    accountCharacteristics?: string;
    topBuzzPosts?: {
      username: string;
      accountAgeSummary: string;
      contentSummary: string;
      likeCount: number;
      repostCount: number;
      hasImage: boolean;
      buzzReason: string;
    }[];
  } | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getAdultGenres() {
  return apiFetch<ApiAdultGenre[]>("/api/research/genres");
}

export function createAdultGenre(data: { name: string; description?: string }) {
  return apiFetch<ApiAdultGenre>("/api/research/genres", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteAdultGenre(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/research/genres/${id}`, { method: "DELETE" });
}

export function getAdultGenre(id: string) {
  return apiFetch<ApiAdultGenre & { referenceAccounts: ApiReferenceAccount[] }>(
    `/api/research/genres/${id}`,
  );
}

export function addReferenceAccount(
  genreId: string,
  data: { username: string; platform?: string; notes?: string },
) {
  return apiFetch<ApiReferenceAccount>(`/api/research/genres/${genreId}/accounts`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteReferenceAccount(genreId: string, accountId: string) {
  return apiFetch<{ ok: boolean }>(
    `/api/research/genres/${genreId}/accounts/${accountId}`,
    { method: "DELETE" },
  );
}

export function analyzeGenre(genreId: string) {
  return apiFetch<{ profileId: string; status: string; jobId?: string }>(
    `/api/research/genres/${genreId}/analyze`,
    { method: "POST" },
  );
}

export interface AnalyzeJobStatus {
  id: string;
  state: string;
  progress: unknown;
  failedReason: string | null;
  timestamp: number;
  finishedOn: number | null;
}

export function getAnalyzeJobStatus(jobId: string) {
  return apiFetch<AnalyzeJobStatus>(`/api/research/analyze-jobs/${jobId}`);
}


export function getGenreProfile(genreId: string) {
  return apiFetch<ApiGenreProfile | null>(`/api/research/genres/${genreId}/profile`);
}

export function getAccountsWithProfile(genreId: string) {
  return apiFetch<ApiReferenceAccount[]>(`/api/research/genres/${genreId}/accounts-with-profile`);
}

export function getMonitoredPosts(genreId: string, limit = 50) {
  return apiFetch<ApiMonitoredPost[]>(`/api/research/genres/${genreId}/posts?limit=${limit}`);
}

export function getOwnThreadsAccounts() {
  return apiFetch<ApiAccount[]>("/api/accounts").then((accounts) =>
    accounts.filter((a) => a.platform === "threads" && a.status === "active"),
  );
}

export interface MonitoredPostsFilter {
  limit?: number;
  minLikes?: number;
  maxLikes?: number;
  minReplies?: number;
  maxReplies?: number;
  minViews?: number;
  maxViews?: number;
  minReposts?: number;
  maxReposts?: number;
  since?: string;
  until?: string;
  applyBuzzThreshold?: boolean;
  orderBy?: "buzz" | "likes" | "views" | "replies" | "reposts" | "postedAt";
}

export function getMonitoredPostsFiltered(genreId: string, filter: MonitoredPostsFilter = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const query = qs.toString();
  return apiFetch<ApiMonitoredPost[]>(
    `/api/research/genres/${genreId}/posts${query ? `?${query}` : ""}`,
  );
}

export function bulkAddReferenceAccounts(
  genreId: string,
  data: { usernames: string[]; platform?: string },
) {
  return apiFetch<{ added: ApiReferenceAccount[]; skipped: string[] }>(
    `/api/research/genres/${genreId}/accounts/bulk`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export function updateAdultGenre(
  genreId: string,
  data: { name?: string; description?: string | null; buzzThresholds?: Partial<ApiBuzzThresholds> },
) {
  return apiFetch<ApiAdultGenre>(`/api/research/genres/${genreId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export interface BulkRepostResult {
  ok: boolean;
  requestedCount: number;
  scheduledCount: number;
  accountId: string;
  accountUsername: string;
  intervalMinutes: number;
  firstAt?: string;
  lastAt?: string;
  items: Array<{
    monitoredPostId: string;
    postId: string;
    scheduledPostId: string;
    scheduledAt: string;
  }>;
}

export function queueBulkRepost(
  genreId: string,
  data: {
    accountIds?: string[];
    accountId?: string;
    count: number;
    intervalMinutes: number;
    startAt?: string;
    orderBy?: "buzz" | "likes" | "views" | "replies" | "reposts";
    applyBuzzThreshold?: boolean;
  },
) {
  return apiFetch<BulkRepostResult>(
    `/api/research/genres/${genreId}/queue-bulk-repost`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export interface ResearchAndPostResult {
  ok: boolean;
  monitorJobId: string;
  pendingAutoPost: {
    count: number;
    intervalMinutes: number;
    accountIds: string[];
    orderBy: string;
  };
}

export function startResearchAndPost(
  genreId: string,
  data: {
    accountIds: string[];
    count: number;
    intervalMinutes: number;
    orderBy?: "buzz" | "likes" | "views" | "replies" | "reposts";
    startAt?: string;
    applyBuzzThreshold?: boolean;
    monitorLimit?: number;
  },
) {
  return apiFetch<ResearchAndPostResult>(
    `/api/research/genres/${genreId}/research-and-post`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export function getPostScoreHistory(postId: string) {
  return apiFetch<ApiPostScoreSnapshot[]>(`/api/research/posts/${postId}/history`);
}

export interface MonitorFilterInput {
  minLikes?: number;
  maxLikes?: number;
  minReplies?: number;
  maxReplies?: number;
  minViews?: number;
  maxViews?: number;
  minReposts?: number;
  maxReposts?: number;
  applyBuzzThreshold?: boolean;
}

export function triggerMonitor(
  genreId: string,
  opts: {
    limit?: number;
    postDelayMs?: [number, number];
    filter?: MonitorFilterInput;
  } = {},
) {
  return apiFetch<{ jobId: string; status: string; limit: number }>(
    `/api/research/genres/${genreId}/monitor`,
    {
      method: "POST",
      body: JSON.stringify({
        limit: opts.limit,
        postDelayMs: opts.postDelayMs,
        filter: opts.filter,
      }),
    },
  );
}

export interface MonitorJobStatus {
  id: string;
  state: string;
  progress: {
    phase?: "init" | "scraping-profile" | "scraping-posts" | "done";
    totalAccounts?: number;
    accountIndex?: number;
    currentAccount?: string | null;
    targetMatches?: number;
    matchedCount?: number;
    processedCount?: number;
    message?: string;
    newPosts?: number;
    updatedPosts?: number;
  } | number | null;
  data: { genreId?: string; limit?: number };
  failedReason: string | null;
  returnvalue: unknown;
  timestamp: number;
  finishedOn: number | null;
}

export function getMonitorJobStatus(jobId: string) {
  return apiFetch<MonitorJobStatus>(`/api/research/monitor-jobs/${jobId}`);
}

// ---- スコア監視 ----

export interface ApiDailySnapshot {
  id: string;
  referenceAccountId: string;
  genreId: string;
  snapshotDate: string;
  followersCount: number | null;
  followingCount: number | null;
  postsCount: number | null;
  dailyPostsCount: number;
  totalLikes: number;
  totalImpressions: number;
  totalReposts: number;
  totalReplies: number;
  engagementRate: number | null;
  topPostBuzzScore: number | null;
  createdAt: string;
}

export interface ApiDailyAggregate {
  snapshotDate: string;
  totalFollowers: number;
  totalPosts: number;
  totalDailyPosts: number;
  totalLikes: number;
  totalImpressions: number;
  totalReposts: number;
  totalReplies: number;
  avgEngagementRate: number;
  accountCount: number;
}

export function getDailySnapshots(genreId: string, days = 30, accountId?: string) {
  const qs = new URLSearchParams({ days: String(days) });
  if (accountId) qs.set("accountId", accountId);
  return apiFetch<ApiDailySnapshot[]>(
    `/api/research/genres/${genreId}/daily-snapshots?${qs}`,
  );
}

export function getDailyAggregate(genreId: string, days = 30) {
  return apiFetch<ApiDailyAggregate[]>(
    `/api/research/genres/${genreId}/daily-aggregate?days=${days}`,
  );
}

export function triggerSnapshot(genreId: string) {
  return apiFetch<{ created: number; date: string }>(
    `/api/research/genres/${genreId}/snapshot`,
    { method: "POST" },
  );
}

// ---- 成長分析 ----

export interface ApiGrowthData {
  account: ApiReferenceAccount;
  dailyData: ApiDailySnapshot[];
  buzzPosts: ApiMonitoredPost[];
  followerGrowthRate: number;
  dataPoints: number;
}

export function getGrowthAnalysis(genreId: string) {
  return apiFetch<ApiGrowthData[]>(`/api/research/genres/${genreId}/growth`);
}

// ---- 類似アカウント ----

export interface ApiSimilarAccount {
  id: string;
  referenceAccountId: string;
  genreId: string;
  username: string;
  platform: string;
  followersCount: number | null;
  bio: string | null;
  similarityScore: number;
  similarityReason: string | null;
  isAdded: boolean;
  createdAt: string;
}

export function getSimilarAccounts(genreId: string) {
  return apiFetch<ApiSimilarAccount[]>(`/api/research/genres/${genreId}/similar`);
}

export function addSimilarToReference(similarId: string) {
  return apiFetch<ApiReferenceAccount>(
    `/api/research/similar/${similarId}/add`,
    { method: "POST" },
  );
}

// ---- パフォーマンスランキング ----

export interface ApiPerformancePost {
  id: string;
  account_id: string;
  platform: string;
  content_text: string | null;
  status: string;
  posted_at: string | null;
  created_at: string;
  likes: number;
  reposts: number;
  replies: number;
  views: number;
  last_metrics_at: string;
  initial_likes: number;
  initial_views: number;
  first_collected_at: string | null;
  engagement_rate: number;
  account_username: string;
  account_display_name: string | null;
}

export interface ApiPerformanceSummary {
  total_posts: number;
  avg_likes: number;
  avg_impressions: number;
  max_likes: number;
  max_impressions: number;
  avg_engagement_rate: number;
}

export function getPerformanceRanking(
  metric: "likes" | "impressions" | "engagement" | "initial" = "likes",
  limit = 50,
  accountId?: string,
) {
  const qs = new URLSearchParams({ metric, limit: String(limit) });
  if (accountId) qs.set("accountId", accountId);
  return apiFetch<ApiPerformancePost[]>(`/api/research/performance?${qs}`);
}

export function getPerformanceSummary(accountId?: string) {
  const qs = accountId ? `?accountId=${accountId}` : "";
  return apiFetch<ApiPerformanceSummary>(`/api/research/performance/summary${qs}`);
}

// ---- アカウントグループ ----

export interface ApiAccountGroupMember {
  id: string;
  accountId: string;
  addedAt: string;
  account: {
    id: string;
    platform: string;
    username: string;
    displayName: string | null;
    status: string;
  };
}

export interface ApiAccountGroup {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  members: ApiAccountGroupMember[];
}

export function getAccountGroups() {
  return apiFetch<ApiAccountGroup[]>("/api/account-groups");
}

export function createAccountGroup(data: { name: string; description?: string }) {
  return apiFetch<ApiAccountGroup>("/api/account-groups", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteAccountGroup(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/account-groups/${id}`, { method: "DELETE" });
}

export function addGroupMember(groupId: string, accountId: string) {
  return apiFetch<ApiAccountGroupMember>(`/api/account-groups/${groupId}/members`, {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
}

export function removeGroupMember(groupId: string, memberId: string) {
  return apiFetch<{ ok: boolean }>(`/api/account-groups/${groupId}/members/${memberId}`, {
    method: "DELETE",
  });
}

export function bulkPost(groupId: string, data: {
  contentText: string;
  scheduledAt?: string;
  linkUrl?: string;
}) {
  return apiFetch<{ created: number; posts: { postId: string; accountId: string; username: string; platform: string; status: string }[] }>(
    `/api/account-groups/${groupId}/bulk-post`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export function getGroupStats(groupId: string) {
  return apiFetch<{
    group: { id: string; name: string; description: string | null };
    stats: { account_id: string; username: string; platform: string; display_name: string | null; post_count: number; posted_count: number; followers: number }[];
  }>(`/api/account-groups/${groupId}/stats`);
}

// ═════════════════════════════════════════════════════════════
// X Mentor (x-mastery-mentor skill)
// ═════════════════════════════════════════════════════════════
export interface MentorMessage {
  role: "user" | "assistant";
  content: string;
}

export type MentorScenario = "write" | "topic" | "review" | "growth" | "diagnose";

export function postMentorChat(messages: MentorMessage[], scenario?: MentorScenario) {
  return apiFetch<{ reply: string }>(`/api/mentor/chat`, {
    method: "POST",
    body: JSON.stringify({ messages, scenario }),
  });
}

export function getMentorHealth() {
  return apiFetch<{ ok: boolean; skill_dir: string; context_chars: number; gemini_key: boolean; error?: string }>(
    `/api/mentor/health`,
  );
}

// ---- リサーチ自動投稿 ----

export function getOwnAccounts() {
  return apiFetch<ApiAccount[]>("/api/accounts?platform=threads");
}

export interface ApiAutoPostResult {
  ok: boolean;
  scheduledCount: number;
  accountIds: string[];
  intervalMinutes: number;
  maxPosts: number;
  posts?: Array<{
    postId: string;
    scheduledAt: string;
    accountUsername: string;
    contentPreview: string;
    monitoredPostId: string;
  }>;
}

export interface AutoPostStatusResult {
  total: number;
  pending: number;
  processing: number;
  done: number;
  failed: number;
  items: Array<{
    postId: string;
    status: string;
    scheduledAt: string | null;
    accountUsername: string;
    contentPreview: string;
    errorMessage: string | null;
  }>;
}

export function getAutoPostStatus(genreId: string, postIds: string[]) {
  return apiFetch<AutoPostStatusResult>(
    `/api/research/genres/${genreId}/auto-post/status?postIds=${postIds.join(",")}`,
  );
}

export interface AutoPostEngagementFilter {
  minLikes?: number;
  maxLikes?: number;
  minReplies?: number;
  maxReplies?: number;
  minViews?: number;
  maxViews?: number;
  minReposts?: number;
  maxReposts?: number;
}

// ---- Instagram Stories ----

export interface InstagramStoryUpload {
  filename: string;
  url: string;
  size: number;
  modifiedAt: string;
}

export function getInstagramStoryUploads() {
  return apiFetch<InstagramStoryUpload[]>("/api/instagram/stories/uploads");
}

export interface PostInstagramStoryInput {
  accountId: string;
  imagePath: string;
  caption?: string;
  affiliateUrl?: string;
  linkText?: string;
}

export function postInstagramStory(data: PostInstagramStoryInput) {
  return apiFetch<{ ok: boolean; storyId?: string }>("/api/instagram/story", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---- Instagram Feed (folder-driven posts) ----

export interface InstagramPendingImage {
  filename: string;
  path: string;
  size: number;
  updatedAt: string;
  meta: {
    caption?: string;
    affiliateUrl?: string;
    affiliateLabel?: string;
    platforms?: ("feed" | "story")[];
  } | null;
}

export function getInstagramPendingImages(account: string) {
  return apiFetch<{ images: InstagramPendingImage[] }>(
    `/api/instagram/posts/pending?account=${encodeURIComponent(account)}`,
  );
}

export interface InstagramFromFolderInput {
  account: string;
  filenames?: string[];
  modes?: ("feed" | "story")[];
  intervalSec?: number;
  headless?: boolean;
  captionOverride?: string;
  affiliateUrlOverride?: string;
  affiliateLabelOverride?: string;
}

export interface InstagramFromFolderResult {
  enqueued: { postId: string; jobId: string | undefined; filename: string }[];
  count: number;
  intervalSec: number;
  modes: ("feed" | "story")[];
}

export function postInstagramFromFolder(data: InstagramFromFolderInput) {
  return apiFetch<InstagramFromFolderResult>("/api/instagram/posts/from-folder", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---- Scraper Engine ----

export type ScraperEngine = "playwright" | "scrapling";

export interface ScraperEngineResponse {
  engine: ScraperEngine;
}

export function getScraperEngine() {
  return apiFetch<ScraperEngineResponse>("/api/scraper-engine");
}

export function setScraperEngine(engine: ScraperEngine) {
  return apiFetch<ScraperEngineResponse>("/api/scraper-engine", {
    method: "POST",
    body: JSON.stringify({ engine }),
  });
}

// ---- Research Auto Post ----

export function startResearchAutoPost(
  genreId: string,
  data: {
    accountIds: string[];
    intervalMinutes: number;
    maxPosts: number;
    orderBy?: "buzz" | "likes" | "views" | "replies" | "reposts";
    filter?: AutoPostEngagementFilter;
    /** true: 画像付き投稿も対象に含める（テキスト+画像で投稿） */
    includeImagePosts?: boolean;
  },
) {
  return apiFetch<ApiAutoPostResult>(`/api/research/genres/${genreId}/auto-post`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function startResearchAutoPostMulti(data: {
  genreIds: string[];
  accountIds: string[];
  intervalMinutes: number;
  maxPosts: number;
  orderBy?: "buzz" | "likes" | "views" | "replies" | "reposts";
  filter?: AutoPostEngagementFilter;
  includeImagePosts?: boolean;
}) {
  return apiFetch<ApiAutoPostResult>(`/api/research/auto-post-multi`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getAutoPostStatusMulti(postIds: string[]) {
  return apiFetch<AutoPostStatusResult>(
    `/api/research/auto-post-multi/status?postIds=${postIds.join(",")}`,
  );
}

export interface ApiPostMetricsHistoryPoint {
  id: string;
  collectedAt: string;
  likes: number;
  reposts: number;
  replies: number;
  views: number;
  profileVisits: number;
}

export function getPostMetricsHistory(postId: string) {
  return apiFetch<ApiPostMetricsHistoryPoint[]>(
    `/api/research/performance/post/${postId}/history`,
  );
}

// ─── Affiliate PDCA ──────────────────────────────────────────

export interface ApiAffiliateLink {
  id: string;
  case_name: string;
  asp: string;
  tracking_url: string;
  short_slug: string;
  genre: string | null;
  unit_payout: number | null;
  status: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
  total_clicks?: number;
  total_cv?: number;
  total_revenue?: number;
}

export interface ApiStoryPost {
  id: string;
  posted_at: string;
  account_id: string | null;
  link_id: string | null;
  source_buzz_id: string | null;
  image_path: string | null;
  caption: string | null;
  schedule_id: string | null;
  note: string | null;
  expired_at: string | null;
  created_at: string;
  account_username?: string | null;
  link_case_name?: string | null;
  link_short_slug?: string | null;
  link_asp?: string | null;
  click_count_via_link?: number;
}

export interface ApiAffiliateDashboard {
  linkRoas: Array<{
    id: string;
    case_name: string;
    asp: string;
    unit_payout: number | null;
    clicks: number;
    cv: number;
    revenue: number;
    cvr: number;
  }>;
  accountCvr: Array<{
    id: string;
    username: string;
    platform: string;
    story_count: number;
    clicks: number;
    cv: number;
  }>;
  heatmap: Array<{ dow: number; hour: number; clicks: number }>;
}

export function getAffiliateLinks() {
  return apiFetch<ApiAffiliateLink[]>("/api/affiliate/links");
}

export function createAffiliateLink(data: {
  caseName: string;
  asp: string;
  trackingUrl: string;
  shortSlug?: string;
  genre?: string;
  unitPayout?: number;
  memo?: string;
}) {
  return apiFetch<ApiAffiliateLink>("/api/affiliate/links", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateAffiliateLink(
  id: string,
  data: Partial<{
    caseName: string;
    asp: string;
    trackingUrl: string;
    genre: string;
    unitPayout: number;
    status: "active" | "paused" | "dead";
    memo: string;
  }>,
) {
  return apiFetch<ApiAffiliateLink>(`/api/affiliate/links/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteAffiliateLink(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/affiliate/links/${id}`, { method: "DELETE" });
}

export function getStoryPosts(limit = 100) {
  return apiFetch<ApiStoryPost[]>(`/api/affiliate/posts?limit=${limit}`);
}

export function createStoryPost(data: {
  linkId?: string;
  accountId?: string;
  caption?: string;
  imagePath?: string;
  sourceBuzzId?: string;
  note?: string;
  postedAt?: string;
}) {
  return apiFetch<ApiStoryPost>("/api/affiliate/posts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteStoryPost(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/affiliate/posts/${id}`, { method: "DELETE" });
}

export function getAffiliateDashboard(from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const q = qs.toString();
  return apiFetch<ApiAffiliateDashboard>(`/api/affiliate/dashboard${q ? `?${q}` : ""}`);
}
