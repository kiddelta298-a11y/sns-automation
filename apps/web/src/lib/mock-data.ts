import type {
  Post,
  PostMetrics,
  PostWithMetrics,
  DashboardSummary,
} from "@/types/post";

const posts: Post[] = [
  {
    id: "post_001",
    accountId: "acc_01",
    platform: "threads",
    contentText:
      "【無料LINE講座】SNSマーケティングの基礎を3日間で学べる無料講座を開催中！プロフィールのリンクからどうぞ🔗 #SNSマーケ #無料講座",
    linkUrl: "https://r.example.com/abc001",
    status: "posted",
    platformPostId: "th_12345",
    postedAt: "2026-03-19T10:00:00+09:00",
    createdAt: "2026-03-19T09:30:00+09:00",
    updatedAt: "2026-03-19T10:00:00+09:00",
  },
  {
    id: "post_002",
    accountId: "acc_01",
    platform: "x",
    contentText:
      "SNS運用で売上3倍にした方法を公開します。具体的なステップはプロフのリンクから👇 #マーケティング #SNS運用",
    linkUrl: "https://r.example.com/abc002",
    status: "posted",
    platformPostId: "x_67890",
    postedAt: "2026-03-18T18:00:00+09:00",
    createdAt: "2026-03-18T17:30:00+09:00",
    updatedAt: "2026-03-18T18:00:00+09:00",
  },
  {
    id: "post_003",
    accountId: "acc_02",
    platform: "instagram",
    contentText:
      "今日から使えるSNS投稿テンプレート5選📱\n\n1. ビフォーアフター\n2. 数字インパクト\n3. 質問形式\n4. ストーリー型\n5. まとめ系\n\n詳細はプロフリンクから✨",
    linkUrl: "https://r.example.com/abc003",
    status: "posted",
    platformPostId: "ig_11111",
    postedAt: "2026-03-17T12:00:00+09:00",
    createdAt: "2026-03-17T11:00:00+09:00",
    updatedAt: "2026-03-17T12:00:00+09:00",
  },
  {
    id: "post_004",
    accountId: "acc_01",
    platform: "threads",
    contentText:
      "来週の投稿予定です。フォロワーとのエンゲージメントを高める具体的な方法をシェアします💡",
    linkUrl: null,
    status: "scheduled",
    platformPostId: null,
    postedAt: null,
    createdAt: "2026-03-20T08:00:00+09:00",
    updatedAt: "2026-03-20T08:00:00+09:00",
  },
  {
    id: "post_005",
    accountId: "acc_01",
    platform: "x",
    contentText: "下書き中の投稿テスト",
    linkUrl: null,
    status: "draft",
    platformPostId: null,
    postedAt: null,
    createdAt: "2026-03-20T09:00:00+09:00",
    updatedAt: "2026-03-20T09:00:00+09:00",
  },
  {
    id: "post_006",
    accountId: "acc_02",
    platform: "threads",
    contentText:
      "【期間限定】3月末まで！LINE登録で特別資料プレゼント🎁 プロフィールリンクからどうぞ #期間限定 #無料プレゼント",
    linkUrl: "https://r.example.com/abc006",
    status: "posted",
    platformPostId: "th_22222",
    postedAt: "2026-03-16T14:00:00+09:00",
    createdAt: "2026-03-16T13:00:00+09:00",
    updatedAt: "2026-03-16T14:00:00+09:00",
  },
];

const metricsMap: Record<string, PostMetrics> = {
  post_001: {
    id: "m_001",
    postId: "post_001",
    collectedAt: "2026-03-20T01:00:00+09:00",
    likes: 45,
    reposts: 12,
    replies: 8,
    views: 1230,
    profileVisits: 67,
  },
  post_002: {
    id: "m_002",
    postId: "post_002",
    collectedAt: "2026-03-20T01:00:00+09:00",
    likes: 89,
    reposts: 34,
    replies: 15,
    views: 3450,
    profileVisits: 120,
  },
  post_003: {
    id: "m_003",
    postId: "post_003",
    collectedAt: "2026-03-20T01:00:00+09:00",
    likes: 156,
    reposts: 23,
    replies: 42,
    views: 5200,
    profileVisits: 210,
  },
  post_006: {
    id: "m_006",
    postId: "post_006",
    collectedAt: "2026-03-20T01:00:00+09:00",
    likes: 67,
    reposts: 19,
    replies: 11,
    views: 2100,
    profileVisits: 89,
  },
};

const clickCounts: Record<string, number> = {
  post_001: 23,
  post_002: 56,
  post_003: 87,
  post_006: 34,
};

export function getMockPosts(): PostWithMetrics[] {
  return posts.map((post) => ({
    ...post,
    metrics: metricsMap[post.id] ?? null,
    clickCount: clickCounts[post.id] ?? 0,
  }));
}

export function getMockPostById(id: string): PostWithMetrics | null {
  const post = posts.find((p) => p.id === id);
  if (!post) return null;
  return {
    ...post,
    metrics: metricsMap[post.id] ?? null,
    clickCount: clickCounts[post.id] ?? 0,
  };
}

export function getMockDashboardSummary(): DashboardSummary {
  const allPosts = getMockPosts();
  return {
    totalPosts: allPosts.length,
    postedCount: allPosts.filter((p) => p.status === "posted").length,
    scheduledCount: allPosts.filter((p) => p.status === "scheduled").length,
    draftCount: allPosts.filter((p) => p.status === "draft").length,
    totalClicks: allPosts.reduce((sum, p) => sum + p.clickCount, 0),
    totalViews: allPosts.reduce(
      (sum, p) => sum + (p.metrics?.views ?? 0),
      0,
    ),
  };
}
