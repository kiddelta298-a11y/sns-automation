"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/posts/status-badge";
import { PlatformIcon } from "@/components/posts/platform-icon";
import { getPosts, type ApiPost } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { PlusCircle } from "lucide-react";
import type { Platform, PostStatus } from "@/types/post";

const statusFilters: { label: string; value: PostStatus | "all" }[] = [
  { label: "すべて", value: "all" },
  { label: "投稿済み", value: "posted" },
  { label: "予約済み", value: "scheduled" },
  { label: "下書き", value: "draft" },
  { label: "失敗", value: "failed" },
];

export default function PostsPage() {
  const [filter, setFilter] = useState<PostStatus | "all">("all");
  const [allPosts, setAllPosts] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPosts(100)
      .then(setAllPosts)
      .catch(() => setAllPosts([]))
      .finally(() => setLoading(false));
  }, []);

  const posts =
    filter === "all" ? allPosts : allPosts.filter((p) => p.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">投稿一覧</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            すべての投稿を管理
          </p>
        </div>
        <Link href="/posts/new">
          <Button>
            <PlusCircle className="h-4 w-4" />
            新規投稿
          </Button>
        </Link>
      </div>

      <div className="mt-6 flex gap-2">
        {statusFilters.map((sf) => (
          <button
            key={sf.value}
            onClick={() => setFilter(sf.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              filter === sf.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-border",
            )}
          >
            {sf.label}
          </button>
        ))}
      </div>

      <Card className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-3 font-medium">媒体</th>
                <th className="pb-3 font-medium">内容</th>
                <th className="pb-3 font-medium">ステータス</th>
                <th className="pb-3 font-medium text-right">クリック</th>
                <th className="pb-3 font-medium text-right">いいね</th>
                <th className="pb-3 font-medium text-right">表示</th>
                <th className="pb-3 font-medium text-right">作成日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    読み込み中...
                  </td>
                </tr>
              )}
              {!loading && posts.map((post) => {
                const clickCount = post.redirectLinks?.reduce((s, l) => s + l.clickCount, 0) ?? 0;
                const metrics = post.postMetrics?.[0] ?? null;
                return (
                  <tr key={post.id} className="hover:bg-muted/50">
                    <td className="py-3">
                      <PlatformIcon platform={post.platform as Platform} />
                    </td>
                    <td className="max-w-sm truncate py-3">
                      <Link
                        href={`/posts/${post.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {(post.contentText ?? "").slice(0, 80)}
                        {(post.contentText ?? "").length > 80 ? "..." : ""}
                      </Link>
                    </td>
                    <td className="py-3">
                      <StatusBadge status={post.status as PostStatus} />
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatNumber(clickCount)}
                    </td>
                    <td className="py-3 text-right">
                      {metrics ? formatNumber(metrics.likes ?? 0) : "-"}
                    </td>
                    <td className="py-3 text-right">
                      {metrics ? formatNumber(metrics.views ?? 0) : "-"}
                    </td>
                    <td className="py-3 text-right text-muted-foreground">
                      {formatDate(post.createdAt)}
                    </td>
                  </tr>
                );
              })}
              {!loading && posts.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    投稿がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
