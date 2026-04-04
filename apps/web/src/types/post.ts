export type Platform = "threads" | "x" | "instagram";

export type PostStatus =
  | "draft"
  | "scheduled"
  | "posting"
  | "posted"
  | "failed";

export interface Post {
  id: string;
  accountId: string;
  platform: Platform;
  contentText: string;
  linkUrl: string | null;
  status: PostStatus;
  platformPostId: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostMetrics {
  id: string;
  postId: string;
  collectedAt: string;
  likes: number;
  reposts: number;
  replies: number;
  views: number;
  profileVisits: number | null;
}

export interface PostWithMetrics extends Post {
  metrics: PostMetrics | null;
  clickCount: number;
}

export interface DashboardSummary {
  totalPosts: number;
  postedCount: number;
  scheduledCount: number;
  draftCount: number;
  totalClicks: number;
  totalViews: number;
}
