import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/posts/status-badge";
import { PlatformIcon } from "@/components/posts/platform-icon";
import { getPosts } from "@/lib/api";
import type { Platform, PostStatus } from "@/types/post";
import { formatDate, formatNumber } from "@/lib/utils";
import {
  FileText,
  MousePointerClick,
  Eye,
  CalendarClock,
} from "lucide-react";
import Link from "next/link";

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-lg bg-accent p-2.5">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </Card>
  );
}

export default async function DashboardPage() {
  const allPosts = await getPosts(100).catch(() => []);
  const recentPosts = allPosts.slice(0, 5);

  const postedCount = allPosts.filter((p) => p.status === "posted").length;
  const scheduledCount = allPosts.filter((p) => p.status === "scheduled").length;
  const draftCount = allPosts.filter((p) => p.status === "draft").length;
  const totalClicks = allPosts.reduce(
    (sum, p) => sum + (p.redirectLinks?.reduce((s, l) => s + l.clickCount, 0) ?? 0),
    0,
  );
  const totalViews = allPosts.reduce(
    (sum, p) => sum + (p.postMetrics?.[0]?.views ?? 0),
    0,
  );
  const summary = {
    totalPosts: allPosts.length,
    postedCount,
    scheduledCount,
    draftCount,
    totalClicks,
    totalViews,
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        投稿パフォーマンスの概要
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="総投稿数"
          value={formatNumber(summary.totalPosts)}
          icon={FileText}
          description={`投稿済み ${summary.postedCount} / 予約 ${summary.scheduledCount} / 下書き ${summary.draftCount}`}
        />
        <StatCard
          title="総クリック数"
          value={formatNumber(summary.totalClicks)}
          icon={MousePointerClick}
          description="リダイレクトリンク経由"
        />
        <StatCard
          title="総表示数"
          value={formatNumber(summary.totalViews)}
          icon={Eye}
          description="全投稿の合計ビュー"
        />
        <StatCard
          title="予約投稿"
          value={String(summary.scheduledCount)}
          icon={CalendarClock}
          description="実行待ち"
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>直近の投稿</CardTitle>
            <Link
              href="/posts"
              className="text-sm text-primary hover:underline"
            >
              すべて表示
            </Link>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-3 font-medium">媒体</th>
                <th className="pb-3 font-medium">内容</th>
                <th className="pb-3 font-medium">ステータス</th>
                <th className="pb-3 font-medium text-right">クリック</th>
                <th className="pb-3 font-medium text-right">表示</th>
                <th className="pb-3 font-medium text-right">日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentPosts.map((post) => (
                <tr key={post.id} className="hover:bg-muted/50">
                  <td className="py-3">
                    <PlatformIcon platform={post.platform as Platform} />
                  </td>
                  <td className="max-w-xs truncate py-3">
                    <Link
                      href={`/posts/${post.id}`}
                      className="hover:text-primary hover:underline"
                    >
                      {(post.contentText ?? "").slice(0, 60)}
                      {(post.contentText ?? "").length > 60 ? "..." : ""}
                    </Link>
                  </td>
                  <td className="py-3">
                    <StatusBadge status={post.status as PostStatus} />
                  </td>
                  <td className="py-3 text-right font-medium">
                    {formatNumber(post.redirectLinks?.reduce((s, l) => s + l.clickCount, 0) ?? 0)}
                  </td>
                  <td className="py-3 text-right font-medium">
                    {post.postMetrics?.length ? formatNumber(post.postMetrics[0].views ?? 0) : "-"}
                  </td>
                  <td className="py-3 text-right text-muted-foreground">
                    {formatDate(post.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
