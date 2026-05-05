import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/posts/status-badge";
import { PlatformIcon } from "@/components/posts/platform-icon";
import { StageBadge } from "@/components/posts/stage-badge";
import {
  getPostAnalytics,
  getScheduledPostByPostId,
  type ScheduledPostDetail,
} from "@/lib/api";
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
  PencilLine,
  ExternalLink,
  Clock,
  Play,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

function buildPlatformPostUrl(platform: string, platformPostId: string): string | null {
  switch (platform) {
    case "threads":
      return `https://www.threads.net/p/${encodeURIComponent(platformPostId)}`;
    case "x":
      return `https://x.com/i/status/${encodeURIComponent(platformPostId)}`;
    case "instagram":
      return `https://www.instagram.com/p/${encodeURIComponent(platformPostId)}`;
    default:
      return null;
  }
}

const EDITABLE_STATUSES: PostStatus[] = ["draft", "scheduled"];

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
  const [data, scheduled] = await Promise.all([
    getPostAnalytics(id).catch(() => null),
    getScheduledPostByPostId(id).catch<ScheduledPostDetail | null>(() => null),
  ]);

  if (!data) {
    notFound();
  }

  const post = data.post;
  const totalClicks = data.totalClicks;
  const metrics = data.latestMetrics;
  const platformPostUrl =
    post.platformPostId && buildPlatformPostUrl(post.platform, post.platformPostId);

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
        {EDITABLE_STATUSES.includes(post.status as PostStatus) && (
          <Link href={`/posts/${post.id}/edit`}>
            <Button variant="outline" className="gap-2">
              <PencilLine className="h-4 w-4" />
              編集
            </Button>
          </Link>
        )}
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

          {/* 添付画像（あれば） */}
          {scheduled?.post.attachments && scheduled.post.attachments.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">添付画像</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {scheduled.post.attachments.map((a, i) => (
                  <div
                    key={`${a.url}-${i}`}
                    className="overflow-hidden rounded-md border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url}
                      alt={`添付${i + 1}`}
                      className="block h-32 w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* プラットフォーム投稿リンク */}
          {post.platformPostId && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">プラットフォーム投稿ID</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="text-xs text-foreground">{post.platformPostId}</code>
                {platformPostUrl && (
                  <a
                    href={platformPostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    投稿を開く
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-6 border-t border-border pt-4 text-xs text-muted-foreground">
            <span>作成: {formatDate(post.createdAt)}</span>
            {post.postedAt && <span>投稿: {formatDate(post.postedAt)}</span>}
            {post.platform && (
              <span>媒体: {post.platform}</span>
            )}
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

      {/* 実行タイムライン */}
      {scheduled && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              実行タイムライン
              {scheduled.stage && <StageBadge stage={scheduled.stage} />}
            </CardTitle>
          </CardHeader>

          <ol className="relative ml-2 border-l border-border pl-6">
            <TimelineItem
              icon={Clock}
              title="予約時刻"
              time={scheduled.scheduledAt}
              accent="muted"
            />
            <TimelineItem
              icon={Play}
              title="実行開始"
              time={scheduled.startedAt}
              accent={scheduled.startedAt ? "primary" : "muted"}
            />
            <TimelineItem
              icon={
                scheduled.status === "failed" ? AlertCircle : CheckCircle2
              }
              title={scheduled.status === "failed" ? "失敗" : "完了"}
              time={scheduled.completedAt}
              accent={
                scheduled.status === "failed"
                  ? "destructive"
                  : scheduled.completedAt
                    ? "success"
                    : "muted"
              }
            />
          </ol>

          {scheduled.errorMessage && (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-xs font-semibold text-destructive">
                エラーメッセージ
                {scheduled.retryCount != null && scheduled.retryCount > 0 && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    (リトライ{scheduled.retryCount}回)
                  </span>
                )}
              </p>
              <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-destructive">
                {scheduled.errorMessage}
              </pre>
            </div>
          )}

          {scheduled.screenshots && scheduled.screenshots.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-foreground">実行時スクリーンショット</p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {scheduled.screenshots.map((s, i) => (
                  <a
                    key={`${s.path}-${i}`}
                    href={s.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block overflow-hidden rounded-md border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.path}
                      alt={`${s.stage} スクリーンショット`}
                      className="block h-32 w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-[10px] text-muted-foreground">
                      <span className="font-mono">{s.stage}</span>
                      <span>{formatDate(s.capturedAt)}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function TimelineItem({
  icon: Icon,
  title,
  time,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  time: string | null;
  accent: "muted" | "primary" | "success" | "destructive";
}) {
  const accentClass =
    accent === "destructive"
      ? "bg-destructive text-destructive-foreground"
      : accent === "success"
        ? "bg-green-500 text-white"
        : accent === "primary"
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground";

  return (
    <li className="relative pb-5 last:pb-0">
      <span
        className={`absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full ${accentClass}`}
      >
        <Icon className="h-3 w-3" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">
        {time ? formatDate(time) : "未実行"}
      </p>
    </li>
  );
}
