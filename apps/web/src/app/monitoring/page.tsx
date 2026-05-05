"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExecStatusBadge } from "@/components/posts/exec-status-badge";
import { PlatformIcon } from "@/components/posts/platform-icon";
import {
  getScheduledPostsStatus,
  type ScheduledPostStatusItem,
  type ExecStatus,
} from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Platform } from "@/types/post";
import { Activity, RefreshCw, Pause, Play } from "lucide-react";

const POLL_INTERVAL_MS = 7_000;
const STATUS_ORDER: ExecStatus[] = ["executing", "pending", "completed", "failed"];

const sectionTitle: Record<ExecStatus, string> = {
  executing: "実行中",
  pending: "待機中",
  completed: "完了",
  failed: "失敗",
};

function groupByStatus(items: ScheduledPostStatusItem[]) {
  const grouped: Record<ExecStatus, ScheduledPostStatusItem[]> = {
    executing: [],
    pending: [],
    completed: [],
    failed: [],
  };
  for (const item of items) {
    if (item.status in grouped) grouped[item.status].push(item);
  }
  return grouped;
}

export default function MonitoringPage() {
  const [items, setItems] = useState<ScheduledPostStatusItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getScheduledPostsStatus();
      setItems(res.items ?? []);
      setGeneratedAt(res.generatedAt ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
      setLastFetchedAt(new Date());
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isPolling) return;
    timerRef.current = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPolling, load]);

  const grouped = groupByStatus(items);
  const counts: Record<ExecStatus, number> = {
    executing: grouped.executing.length,
    pending: grouped.pending.length,
    completed: grouped.completed.length,
    failed: grouped.failed.length,
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            予約投稿リアルタイム監視
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            予約投稿の実行状況を {POLL_INTERVAL_MS / 1000} 秒ごとに自動更新します
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsPolling((p) => !p)}
            className="gap-2"
          >
            {isPolling ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPolling ? "自動更新を停止" : "自動更新を再開"}
          </Button>
          <Button variant="outline" onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            今すぐ更新
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: isPolling ? "#86efac" : "#94a3b8",
              boxShadow: isPolling ? "0 0 8px #86efac" : "none",
            }}
          />
          {isPolling ? "監視中" : "停止中"}
        </span>
        {lastFetchedAt && (
          <span>最終更新: {lastFetchedAt.toLocaleTimeString("ja-JP")}</span>
        )}
        {generatedAt && <span>サーバ生成時刻: {formatDate(generatedAt)}</span>}
      </div>

      {/* サマリーカード */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_ORDER.map((s) => (
          <Card key={s} className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">{sectionTitle[s]}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{counts[s]}</p>
            </div>
            <ExecStatusBadge status={s} />
          </Card>
        ))}
      </div>

      {error && (
        <Card className="mt-6 border-destructive/40 p-4 text-sm">
          <p className="text-destructive">取得に失敗しました: {error}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            BE 側の <code>/api/scheduled-posts/status</code>{" "}
            が未実装の可能性があります（task_043 完了後に解消されます）。
          </p>
        </Card>
      )}

      {loading && !error && items.length === 0 && (
        <Card className="mt-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </Card>
      )}

      {!loading && !error && items.length === 0 && (
        <Card className="mt-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">監視対象の予約投稿はありません</p>
        </Card>
      )}

      {STATUS_ORDER.map((s) => {
        const list = grouped[s];
        if (list.length === 0) return null;
        return (
          <section key={s} className="mt-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ExecStatusBadge status={s} />
              <span className="text-muted-foreground">{list.length}件</span>
            </h2>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-3 font-medium">媒体</th>
                      <th className="px-3 py-3 font-medium">アカウント</th>
                      <th className="px-3 py-3 font-medium">内容</th>
                      <th className="px-3 py-3 font-medium text-right">予約日時</th>
                      <th className="px-3 py-3 font-medium text-right">実行日時</th>
                      {s === "failed" && (
                        <th className="px-3 py-3 font-medium">エラー</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-3 py-3">
                          <PlatformIcon
                            platform={(item.post.platform ?? "threads") as Platform}
                          />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                          @{item.post.account?.username ?? "—"}
                        </td>
                        <td className="max-w-md px-3 py-3">
                          <Link
                            href={`/posts/${item.postId}`}
                            className="line-clamp-2 hover:text-primary hover:underline"
                          >
                            {item.post.contentText ?? "（本文なし）"}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(item.scheduledAt)}
                        </td>
                        <td className="px-3 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                          {item.executedAt ? formatDate(item.executedAt) : "—"}
                        </td>
                        {s === "failed" && (
                          <td className="max-w-xs px-3 py-3">
                            <p className="line-clamp-2 text-xs text-destructive">
                              {item.errorMessage ?? "—"}
                            </p>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
