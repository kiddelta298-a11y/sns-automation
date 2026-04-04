import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/posts/status-badge";
import { PlatformIcon } from "@/components/posts/platform-icon";
import { getPostAnalytics } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Platform, PostStatus } from "@/types/post";
import {
  ArrowLeft,
  Heart,
  Repeat2,
  MessageSquare,
  Eye,
  MousePointerClick,
  UserCheck,
} from "lucide-react";

function MetricItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPostAnalytics(id).catch(() => null);

  if (!data) {
    notFound();
  }

  const post = data.post;
  const totalClicks = data.totalClicks;
  const metrics = data.latestMetrics;

  return (
    <div>
      <Link
        href="/posts"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        投稿一覧に戻る
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">投稿詳細</h1>
          <div className="mt-2 flex items-center gap-3">
            <PlatformIcon platform={post.platform as Platform} />
            <StatusBadge status={post.status as PostStatus} />
            <span className="text-sm text-muted-foreground">
              {post.id}
            </span>
          </div>
        </div>
        <Button variant="outline">編集</Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>投稿内容</CardTitle>
          </CardHeader>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {post.contentText}
          </p>
          {post.linkUrl && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">リンクURL</p>
              <p className="mt-1 text-sm font-medium text-primary">
                {post.linkUrl}
              </p>
            </div>
          )}
          <div className="mt-4 flex gap-6 border-t border-border pt-4 text-xs text-muted-foreground">
            <span>作成: {formatDate(post.createdAt)}</span>
            {post.postedAt && <span>投稿: {formatDate(post.postedAt)}</span>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>メトリクス</CardTitle>
            </CardHeader>
            {metrics ? (
              <div className="grid grid-cols-2 gap-3">
                <MetricItem
                  icon={Heart}
                  label="いいね"
                  value={formatNumber(metrics.likes ?? 0)}
                />
                <MetricItem
                  icon={Repeat2}
                  label="リポスト"
                  value={formatNumber(metrics.reposts ?? 0)}
                />
                <MetricItem
                  icon={MessageSquare}
                  label="返信"
                  value={formatNumber(metrics.replies ?? 0)}
                />
                <MetricItem
                  icon={Eye}
                  label="表示"
                  value={formatNumber(metrics.views ?? 0)}
                />
                <MetricItem
                  icon={MousePointerClick}
                  label="クリック"
                  value={formatNumber(totalClicks)}
                />
                <MetricItem
                  icon={UserCheck}
                  label="プロフ遷移"
                  value={
                    metrics.profileVisits != null
                      ? formatNumber(metrics.profileVisits)
                      : "-"
                  }
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                メトリクスはまだ収集されていません
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
