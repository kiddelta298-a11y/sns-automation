"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  FileText, MousePointerClick, Eye, CalendarClock,
  Calendar as CalendarIcon,
} from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { ApiPost } from "@/lib/api";

type RangeKey = "today" | "7d" | "30d" | "all" | "custom";

const RANGE_PRESETS: Array<{ key: Exclude<RangeKey, "custom">; label: string }> = [
  { key: "today", label: "今日" },
  { key: "7d", label: "過去7日" },
  { key: "30d", label: "過去30日" },
  { key: "all", label: "全期間" },
];

function StatCard({
  title, value, icon: Icon, description, gradient,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  gradient: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "rgba(240,238,255,0.42)" }}>{title}</p>
          <p className="mt-2 text-3xl font-bold" style={{ color: "#f0eeff" }}>{value}</p>
          <p className="mt-1 text-xs" style={{ color: "rgba(240,238,255,0.38)" }}>{description}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl shrink-0"
          style={{
            background: gradient,
            boxShadow: "0 0 20px rgba(139,92,246,0.3)",
          }}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </Card>
  );
}

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangeBounds(range: RangeKey, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (range) {
    case "today": {
      return { from: todayMidnight(), to: now };
    }
    case "7d": {
      const f = new Date(now);
      f.setDate(f.getDate() - 7);
      return { from: f, to: now };
    }
    case "30d": {
      const f = new Date(now);
      f.setDate(f.getDate() - 30);
      return { from: f, to: now };
    }
    case "all":
      return { from: null, to: null };
    case "custom": {
      const from = customFrom ? new Date(customFrom + "T00:00:00") : null;
      const to = customTo ? new Date(customTo + "T23:59:59") : null;
      return { from, to };
    }
  }
}

export function DashboardMetrics({ posts }: { posts: ApiPost[] }) {
  const [range, setRange] = useState<RangeKey>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [showCalendar, setShowCalendar] = useState(false);

  const { from, to } = useMemo(
    () => rangeBounds(range, customFrom, customTo),
    [range, customFrom, customTo],
  );

  const filtered = useMemo(() => {
    if (!from && !to) return posts;
    return posts.filter((p) => {
      const t = new Date(p.createdAt).getTime();
      if (from && t < from.getTime()) return false;
      if (to && t > to.getTime()) return false;
      return true;
    });
  }, [posts, from, to]);

  const postedCount = filtered.filter((p) => p.status === "posted").length;
  const scheduledCount = filtered.filter((p) => p.status === "scheduled").length;
  const draftCount = filtered.filter((p) => p.status === "draft").length;
  const totalClicks = filtered.reduce(
    (sum, p) => sum + (p.redirectLinks?.reduce((s, l) => s + l.clickCount, 0) ?? 0),
    0,
  );
  const totalViews = filtered.reduce(
    (sum, p) => sum + (p.postMetrics?.[0]?.views ?? 0),
    0,
  );

  const rangeLabel =
    range === "custom" && (customFrom || customTo)
      ? `${customFrom || "—"} 〜 ${customTo || "—"}`
      : RANGE_PRESETS.find((r) => r.key === range)?.label ?? "全期間";

  return (
    <div className="space-y-4">
      {/* 期間切替コントロール（右上） */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <div className="flex gap-1 rounded-lg p-1"
          style={{ background: "rgba(15,12,30,0.5)", border: "1px solid rgba(139,92,246,0.15)" }}>
          {RANGE_PRESETS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { setRange(opt.key); setShowCalendar(false); }}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-all"
              style={range === opt.key ? {
                background: "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(168,85,247,0.4))",
                color: "#e9d5ff",
              } : {
                color: "rgba(240,238,255,0.5)",
              }}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => { setRange("custom"); setShowCalendar((v) => !v); }}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
            style={range === "custom" ? {
              background: "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(168,85,247,0.4))",
              color: "#e9d5ff",
            } : {
              color: "rgba(240,238,255,0.5)",
            }}
          >
            <CalendarIcon className="h-3 w-3" />
            カスタム
          </button>
        </div>
      </div>

      {/* カレンダー（カスタム期間のみ表示） */}
      {showCalendar && range === "custom" && (
        <div className="flex items-center gap-2 justify-end flex-wrap rounded-lg p-3"
          style={{ background: "rgba(15,12,30,0.6)", border: "1px solid rgba(139,92,246,0.15)" }}>
          <label className="text-xs" style={{ color: "rgba(240,238,255,0.5)" }}>From</label>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-md px-2 py-1.5 text-xs"
            style={{ background: "rgba(15,12,30,0.8)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.2)" }}
          />
          <label className="text-xs" style={{ color: "rgba(240,238,255,0.5)" }}>To</label>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-md px-2 py-1.5 text-xs"
            style={{ background: "rgba(15,12,30,0.8)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.2)" }}
          />
          {(customFrom || customTo) && (
            <button
              onClick={() => { setCustomFrom(""); setCustomTo(""); }}
              className="text-xs rounded-md px-2 py-1.5"
              style={{ color: "rgba(240,238,255,0.4)", border: "1px solid rgba(139,92,246,0.15)" }}
            >
              クリア
            </button>
          )}
        </div>
      )}

      {/* スタッツ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="総投稿数"
          value={formatNumber(filtered.length)}
          icon={FileText}
          description={`投稿済 ${postedCount} / 予約 ${scheduledCount} / 下書 ${draftCount}（${rangeLabel}）`}
          gradient="linear-gradient(135deg, #7c3aed, #a855f7)"
        />
        <StatCard
          title="総クリック数"
          value={formatNumber(totalClicks)}
          icon={MousePointerClick}
          description={`リダイレクトリンク経由（${rangeLabel}）`}
          gradient="linear-gradient(135deg, #2563eb, #7c3aed)"
        />
        <StatCard
          title="総表示数"
          value={formatNumber(totalViews)}
          icon={Eye}
          description={`期間内投稿の合計ビュー（${rangeLabel}）`}
          gradient="linear-gradient(135deg, #0891b2, #2563eb)"
        />
        <StatCard
          title="予約投稿"
          value={String(scheduledCount)}
          icon={CalendarClock}
          description={`実行待ち（${rangeLabel}）`}
          gradient="linear-gradient(135deg, #9333ea, #ec4899)"
        />
      </div>
    </div>
  );
}
