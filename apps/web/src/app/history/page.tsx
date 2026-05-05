"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/posts/platform-icon";
import {
  getPostHistory,
  type PostHistoryItem,
  type PostHistoryQuery,
} from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types/post";
import { History, RefreshCw, FilterX, ChevronDown, ChevronRight } from "lucide-react";

const PLATFORM_FILTERS: { label: string; value: "all" | Platform }[] = [
  { label: "すべて", value: "all" },
  { label: "Threads", value: "threads" },
  { label: "X", value: "x" },
  { label: "Instagram", value: "instagram" },
];

const STATUS_FILTERS: { label: string; value: "all" | "posted" | "failed" }[] = [
  { label: "すべて", value: "all" },
  { label: "成功", value: "posted" },
  { label: "失敗", value: "failed" },
];

const PAGE_SIZE = 50;

function toIsoStart(date: string) {
  return date ? new Date(`${date}T00:00:00`).toISOString() : undefined;
}
function toIsoEnd(date: string) {
  return date ? new Date(`${date}T23:59:59.999`).toISOString() : undefined;
}

export default function HistoryPage() {
  const [items, setItems] = useState<PostHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [status, setStatus] = useState<"all" | "posted" | "failed">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const query: PostHistoryQuery = useMemo(
    () => ({
      platform,
      status,
      from: toIsoStart(from),
      to: toIsoEnd(to),
      limit: PAGE_SIZE,
      offset,
    }),
    [platform, status, from, to, offset],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPostHistory(query);
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  // フィルタ変更時はページをリセット
  useEffect(() => {
    setOffset(0);
  }, [platform, status, from, to]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setPlatform("all");
    setStatus("all");
    setFrom("");
    setTo("");
    setOffset(0);
  };

  const hasFilters =
    platform !== "all" || status !== "all" || from !== "" || to !== "";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            投稿履歴
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            投稿済み・失敗したコンテンツの一覧を表示します
          </p>
        </div>
        <Button variant="outline" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          更新
        </Button>
      </div>

      {/* フィルターバー */}
      <Card className="mt-6 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              プラットフォーム
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORM_FILTERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPlatform(p.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    platform === p.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-border",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              ステータス
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    status === s.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-border",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="history-from"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              開始日
            </label>
            <input
              id="history-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to || undefined}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
            />
          </div>

          <div>
            <label
              htmlFor="history-to"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              終了日
            </label>
            <input
              id="history-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from || undefined}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
            />
          </div>

          {hasFilters && (
            <Button variant="outline" onClick={clearFilters} className="gap-1.5">
              <FilterX className="h-3.5 w-3.5" />
              フィルタ解除
            </Button>
          )}
        </div>
      </Card>

      {error && (
        <Card className="mt-6 border-destructive/40 p-4 text-sm">
          <p className="text-destructive">取得に失敗しました: {error}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            BE 側の <code>/api/post-history</code>{" "}
            が未実装の可能性があります（task_043 完了後に解消されます）。
          </p>
        </Card>
      )}

      {/* リスト */}
      <Card className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="w-8 px-3 py-3" />
                <th className="px-3 py-3 font-medium">媒体</th>
                <th className="px-3 py-3 font-medium">アカウント</th>
                <th className="px-3 py-3 font-medium">内容</th>
                <th className="px-3 py-3 font-medium">ステータス</th>
                <th className="px-3 py-3 font-medium text-right">投稿日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    読み込み中...
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((item) => {
                  const isFailed = item.status === "failed";
                  const isOpen = expanded.has(item.id);
                  return (
                    <Fragment key={item.id}>
                      <tr
                        className={cn(
                          "hover:bg-muted/30",
                          isFailed && "cursor-pointer",
                        )}
                        onClick={() => isFailed && toggleExpand(item.id)}
                      >
                        <td className="px-3 py-3">
                          {isFailed ? (
                            isOpen ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <PlatformIcon
                            platform={(item.platform ?? "threads") as Platform}
                          />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                          @{item.account?.username ?? "—"}
                        </td>
                        <td className="max-w-md px-3 py-3">
                          <Link
                            href={`/posts/${item.id}`}
                            className="line-clamp-2 hover:text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.contentText ?? "（本文なし）"}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          {isFailed ? (
                            <Badge variant="destructive">失敗</Badge>
                          ) : (
                            <Badge variant="success">投稿済み</Badge>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                          {item.postedAt
                            ? formatDate(item.postedAt)
                            : item.scheduledAt
                              ? formatDate(item.scheduledAt)
                              : "—"}
                        </td>
                      </tr>
                      {isFailed && isOpen && (
                        <tr className="bg-destructive/5">
                          <td colSpan={6} className="px-3 py-3">
                            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
                              <p className="text-xs font-semibold text-destructive">
                                エラー内容
                              </p>
                              <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-destructive">
                                {item.errorMessage ?? "（詳細不明）"}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              {!loading && items.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    条件に一致する投稿はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ページネーション */}
      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-xs text-muted-foreground">
            全 {total} 件中 {offset + 1} - {Math.min(offset + PAGE_SIZE, total)} 件を表示
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              前へ
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              次へ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
