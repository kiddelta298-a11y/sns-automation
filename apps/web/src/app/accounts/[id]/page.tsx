"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAccountMetrics, type ApiAccountMetrics } from "@/lib/api";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/posts/status-badge";
import { PlatformIcon } from "@/components/posts/platform-icon";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Platform, PostStatus } from "@/types/post";
import { ArrowLeft, Heart, Repeat2, MessageSquare, Eye, BarChart3 } from "lucide-react";

function StatCard({ label, value, icon: Icon }: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
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

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  scheduled: "予約済み",
  posted: "投稿済み",
  failed: "失敗",
};

export default function AccountMetricsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [data, setData] = useState<ApiAccountMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => getAccountMetrics(id))
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [params]);

  if (loading) return <p className="text-sm text-muted-foreground">読み込み中...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  const { account, postStats, metrics, recentPosts } = data;

  const totalPosts = postStats.reduce((s, x) => s + Number(x.count), 0);
  const postedCount = Number(postStats.find((x) => x.status === "posted")?.count ?? 0);
  const failedCount = Number(postStats.find((x) => x.status === "failed")?.count ?? 0);

  return (
    <div>
      <Link
        href="/accounts"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        アカウント管理に戻る
      </Link>

      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <PlatformIcon platform={account.platform as Platform} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">@{account.username}</h1>
          <p className="text-sm text-muted-foreground">
            {account.displayName && <span className="mr-2">{account.displayName}</span>}
            {account.platform} · {account.status === "active" ? "稼働中" : account.status}
          </p>
        </div>
      </div>

      {/* 投稿サマリー */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> 投稿サマリー
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "総投稿数", value: totalPosts },
            { label: "投稿済み", value: postedCount },
            { label: "失敗", value: failedCount },
            { label: "その他", value: totalPosts - postedCount - failedCount },
          ].map((item) => (
            <Card key={item.label} className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{item.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.label}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* 直近30日メトリクス */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          直近30日のパフォーマンス
        </h2>
        {Number(metrics.posts_with_metrics ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">メトリクスがまだ収集されていません。</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Heart} label="合計いいね" value={formatNumber(Number(metrics.total_likes ?? 0))} />
            <StatCard icon={Repeat2} label="合計リポスト" value={formatNumber(Number(metrics.total_reposts ?? 0))} />
            <StatCard icon={MessageSquare} label="合計リプライ" value={formatNumber(Number(metrics.total_replies ?? 0))} />
            <StatCard icon={Eye} label="合計表示" value={formatNumber(Number(metrics.total_views ?? 0))} />
          </div>
        )}
      </section>

      {/* 直近投稿 */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          直近10件の投稿
        </h2>
        {recentPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">投稿がありません。</p>
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-3 pl-4 pr-2 text-left">内容</th>
                  <th className="px-2 py-3 text-left">ステータス</th>
                  <th className="px-2 py-3 text-right">いいね</th>
                  <th className="px-2 py-3 text-right">表示</th>
                  <th className="py-3 pl-2 pr-4 text-right">作成日</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentPosts.map((post) => {
                  const m = post.postMetrics?.[0];
                  return (
                    <tr key={post.id} className="hover:bg-muted/30">
                      <td className="py-3 pl-4 pr-2 max-w-xs">
                        <Link href={`/posts/${post.id}`} className="hover:text-primary hover:underline line-clamp-2 text-xs">
                          {post.contentText ?? "—"}
                        </Link>
                      </td>
                      <td className="px-2 py-3">
                        <StatusBadge status={post.status as PostStatus} />
                      </td>
                      <td className="px-2 py-3 text-right text-xs">
                        {m ? formatNumber(m.likes ?? 0) : "—"}
                      </td>
                      <td className="px-2 py-3 text-right text-xs">
                        {m ? formatNumber(m.views ?? 0) : "—"}
                      </td>
                      <td className="py-3 pl-2 pr-4 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(post.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
