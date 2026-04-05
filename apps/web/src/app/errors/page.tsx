"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getErrorPosts, retryPost, type ApiScheduledPost } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/posts/platform-icon";
import { formatDate } from "@/lib/utils";
import type { Platform } from "@/types/post";
import { AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ApiScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retried, setRetried] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setErrors(await getErrorPosts());
    } catch {
      setErrors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRetry = async (sp: ApiScheduledPost) => {
    setRetrying(sp.postId);
    try {
      await retryPost(sp.postId);
      setRetried((prev) => new Set([...prev, sp.postId]));
    } catch (err) {
      alert(err instanceof Error ? err.message : "リトライに失敗しました");
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-destructive" />
            エラー通知
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            投稿に失敗したタスクの一覧とリトライ管理
          </p>
        </div>
        <Button variant="outline" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          更新
        </Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : errors.length === 0 ? (
          <Card className="py-16 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-500 mb-3" />
            <p className="text-sm font-medium text-foreground">エラーはありません</p>
            <p className="mt-1 text-xs text-muted-foreground">すべての投稿は正常に処理されています。</p>
          </Card>
        ) : (
          <Card>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="py-3 pl-4 pr-2 text-left">媒体</th>
                  <th className="px-2 py-3 text-left">アカウント</th>
                  <th className="px-2 py-3 text-left">内容</th>
                  <th className="px-2 py-3 text-left">エラー内容</th>
                  <th className="px-2 py-3 text-right">予約日時</th>
                  <th className="py-3 pl-2 pr-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((sp) => (
                  <tr key={sp.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="py-3 pl-4 pr-2">
                      <PlatformIcon platform={(sp.post.platform ?? "threads") as Platform} />
                    </td>
                    <td className="px-2 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      @{sp.post.account?.username ?? "—"}
                    </td>
                    <td className="px-2 py-3 max-w-xs">
                      <Link
                        href={`/posts/${sp.postId}`}
                        className="text-sm text-foreground hover:text-primary hover:underline line-clamp-2"
                      >
                        {sp.post.contentText ?? "（本文なし）"}
                      </Link>
                    </td>
                    <td className="px-2 py-3 max-w-xs">
                      {sp.errorMessage ? (
                        <p className="text-xs text-destructive line-clamp-2">{sp.errorMessage}</p>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(sp.scheduledAt)}
                    </td>
                    <td className="py-3 pl-2 pr-4 text-right">
                      {retried.has(sp.postId) ? (
                        <span className="text-xs text-green-600 flex items-center justify-end gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> リトライ済
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retrying === sp.postId}
                          onClick={() => handleRetry(sp)}
                          className="h-7 gap-1 px-2.5 text-xs"
                        >
                          <RefreshCw className="h-3 w-3" />
                          リトライ
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
