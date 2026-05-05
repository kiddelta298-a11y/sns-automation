"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PlatformIcon } from "@/components/posts/platform-icon";
import { StageBadge } from "@/components/posts/stage-badge";
import { getScheduledPostsLive, type ScheduledPostLive } from "@/lib/api";
import type { Platform } from "@/types/post";
import { Radio } from "lucide-react";

const POLL_INTERVAL_MS = 5_000;

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function snippet(text: string | null, max = 50) {
  if (!text) return "（本文なし）";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function LiveExecutionPanel() {
  const [items, setItems] = useState<ScheduledPostLive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getScheduledPostsLive();
      setItems(res.items ?? []);
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
    timerRef.current = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Radio className="h-4 w-4 text-primary" />
          実行中投稿ライブパネル
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: error ? "#fda4af" : "#86efac",
              boxShadow: error ? "none" : "0 0 8px #86efac",
            }}
          />
          {error
            ? "接続エラー"
            : `LIVE · ${POLL_INTERVAL_MS / 1000}s 更新`}
          {lastFetchedAt && (
            <span>· {lastFetchedAt.toLocaleTimeString("ja-JP")}</span>
          )}
        </div>
      </div>

      {error && (
        <Card className="border-destructive/30 p-3 text-xs">
          <p className="text-destructive">取得に失敗: {error}</p>
          <p className="mt-1 text-muted-foreground">
            BE 側 <code>/api/scheduled-posts/live</code> 未実装の可能性があります（task_046 完了後に解消）。
          </p>
        </Card>
      )}

      {!error && loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      )}

      {!error && !loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">現在実行中の投稿はありません</p>
      )}

      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const pct = clampPct(item.progressPct);
            return (
              <Link
                key={item.id}
                href={`/posts/${item.postId}`}
                className="group block rounded-lg border border-border bg-background/40 p-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <PlatformIcon
                      platform={(item.post.platform ?? "threads") as Platform}
                    />
                    <span className="truncate text-xs font-medium text-foreground">
                      @{item.post.account?.username ?? "—"}
                    </span>
                  </div>
                  <StageBadge stage={item.stage} />
                </div>

                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground group-hover:text-foreground">
                  {snippet(item.post.contentText)}
                </p>

                {/* 進捗バー */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>進捗</span>
                    <span className="font-mono">{pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: "linear-gradient(90deg,#7c3aed,#a855f7)",
                        boxShadow: "0 0 8px rgba(168,85,247,0.5)",
                      }}
                    />
                  </div>
                </div>

                {/* スクリーンショットサムネ */}
                {item.screenshotPath && (
                  <div className="mt-3 overflow-hidden rounded-md border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.screenshotPath}
                      alt={`実行中スクリーンショット (${item.stage})`}
                      className="block h-32 w-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
