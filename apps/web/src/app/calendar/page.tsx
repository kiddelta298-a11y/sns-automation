"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getCalendarPosts, type ApiScheduledPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar, PlusCircle } from "lucide-react";
import { PlatformIcon } from "@/components/posts/platform-icon";
import type { Platform } from "@/types/post";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-blue-500/80 text-white",
  processing: "bg-yellow-500/80 text-white",
  done: "bg-green-500/80 text-white",
  failed: "bg-red-500/80 text-white",
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function startOfMonth(y: number, m: number) {
  return new Date(y, m, 1);
}

function endOfMonth(y: number, m: number) {
  return new Date(y, m + 1, 0);
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [scheduledPosts, setScheduledPosts] = useState<ApiScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Date | null>(null);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    const from = new Date(y, m, 1).toISOString();
    const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString();
    try {
      const data = await getCalendarPosts(from, to);
      setScheduledPosts(data);
    } catch {
      setScheduledPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year, month);
  }, [load, year, month]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelected(null);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelected(null);
  };

  // Build calendar grid
  const firstDay = startOfMonth(year, month);
  const lastDay = endOfMonth(year, month);
  const startWeekday = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const cells: (Date | null)[] = [
    ...Array<null>(startWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1)),
  ];
  // Pad to complete weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const postsOnDay = (day: Date) =>
    scheduledPosts.filter(sp => isSameDay(new Date(sp.scheduledAt), day));

  const selectedPosts = selected ? postsOnDay(selected) : [];

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            予約投稿カレンダー
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">予約済み投稿のスケジュールを確認</p>
        </div>
        <Link href="/posts/new">
          <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <PlusCircle className="h-4 w-4" />
            新規投稿
          </button>
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* ── カレンダー ── */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          {/* 月ナビ */}
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={prevMonth}
              className="rounded-lg p-1.5 hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-base font-semibold text-foreground">
              {year}年{month + 1}月
            </h2>
            <button
              onClick={nextMonth}
              className="rounded-lg p-1.5 hover:bg-muted transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAY_LABELS.map((d, i) => (
              <div key={d} className={cn(
                "py-1 text-center text-xs font-medium",
                i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground",
              )}>
                {d}
              </div>
            ))}
          </div>

          {/* 日付グリッド */}
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              読み込み中...
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className="aspect-square" />;
                }
                const dayPosts = postsOnDay(day);
                const isToday = isSameDay(day, today);
                const isSelected = selected ? isSameDay(day, selected) : false;
                const weekday = day.getDay();
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelected(isSelected ? null : day)}
                    className={cn(
                      "relative flex flex-col items-center rounded-lg p-1 transition-colors min-h-[52px]",
                      "hover:bg-muted/80",
                      isSelected && "bg-primary/10 ring-1 ring-primary",
                    )}
                  >
                    <span className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                      isToday && "bg-primary text-primary-foreground",
                      !isToday && weekday === 0 && "text-red-500",
                      !isToday && weekday === 6 && "text-blue-500",
                      !isToday && weekday !== 0 && weekday !== 6 && "text-foreground",
                    )}>
                      {day.getDate()}
                    </span>
                    {/* 投稿ドット */}
                    <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                      {dayPosts.slice(0, 3).map((sp) => (
                        <span
                          key={sp.id}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            STATUS_COLOR[sp.status]?.split(" ")[0] ?? "bg-blue-400",
                          )}
                        />
                      ))}
                      {dayPosts.length > 3 && (
                        <span className="text-[9px] text-muted-foreground">+{dayPosts.length - 3}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 凡例 */}
          <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3">
            {[
              { label: "予約中", color: "bg-blue-500/80" },
              { label: "処理中", color: "bg-yellow-500/80" },
              { label: "完了", color: "bg-green-500/80" },
              { label: "失敗", color: "bg-red-500/80" },
            ].map(item => (
              <span key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── 選択日の投稿一覧 ── */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {selected
              ? `${selected.getMonth() + 1}月${selected.getDate()}日の投稿`
              : "日付をクリックして確認"}
          </h3>

          {!selected ? (
            <p className="text-sm text-muted-foreground">
              カレンダーの日付をクリックすると、その日の予約投稿が表示されます。
            </p>
          ) : selectedPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">この日に予約投稿はありません。</p>
          ) : (
            <div className="space-y-3">
              {selectedPosts.map((sp) => (
                <Link
                  key={sp.id}
                  href={`/posts/${sp.postId}`}
                  className="block rounded-lg border border-border p-3 hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <PlatformIcon platform={(sp.post.platform ?? "threads") as Platform} />
                      <span className="text-xs font-medium text-foreground">
                        @{sp.post.account?.username ?? "—"}
                      </span>
                    </div>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      STATUS_COLOR[sp.status] ?? "bg-muted text-muted-foreground",
                    )}>
                      {sp.status === "pending" ? "予約中"
                        : sp.status === "processing" ? "処理中"
                        : sp.status === "done" ? "完了"
                        : sp.status === "failed" ? "失敗"
                        : sp.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {sp.post.contentText ?? "（本文なし）"}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {new Date(sp.scheduledAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {sp.errorMessage && (
                    <p className="mt-1 text-[10px] text-destructive line-clamp-1">{sp.errorMessage}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
