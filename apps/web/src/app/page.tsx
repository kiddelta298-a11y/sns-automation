import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/posts/status-badge";
import { PlatformIcon } from "@/components/posts/platform-icon";
import { getPosts } from "@/lib/api";
import type { Platform, PostStatus } from "@/types/post";
import { formatDate, formatNumber } from "@/lib/utils";
import {
  FileText,
  MousePointerClick,
  Eye,
  CalendarClock,
} from "lucide-react";
import Link from "next/link";

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  gradient,
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

export default async function DashboardPage() {
  const allPosts = await getPosts(100).catch(() => []);
  const recentPosts = allPosts.slice(0, 8);

  const postedCount    = allPosts.filter((p) => p.status === "posted").length;
  const scheduledCount = allPosts.filter((p) => p.status === "scheduled").length;
  const draftCount     = allPosts.filter((p) => p.status === "draft").length;
  const totalClicks    = allPosts.reduce((sum, p) =>
    sum + (p.redirectLinks?.reduce((s, l) => s + l.clickCount, 0) ?? 0), 0);
  const totalViews     = allPosts.reduce((sum, p) =>
    sum + (p.postMetrics?.[0]?.views ?? 0), 0);

  return (
    <div>
      {/* ── ヘッダー ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold gradient-text">ダッシュボード</h1>
        <p className="mt-1 text-sm" style={{ color: "rgba(240,238,255,0.42)" }}>
          投稿パフォーマンスの概要
        </p>
      </div>

      {/* ── スタッツ ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="総投稿数"
          value={formatNumber(allPosts.length)}
          icon={FileText}
          description={`投稿済 ${postedCount} / 予約 ${scheduledCount} / 下書 ${draftCount}`}
          gradient="linear-gradient(135deg, #7c3aed, #a855f7)"
        />
        <StatCard
          title="総クリック数"
          value={formatNumber(totalClicks)}
          icon={MousePointerClick}
          description="リダイレクトリンク経由"
          gradient="linear-gradient(135deg, #2563eb, #7c3aed)"
        />
        <StatCard
          title="総表示数"
          value={formatNumber(totalViews)}
          icon={Eye}
          description="全投稿の合計ビュー"
          gradient="linear-gradient(135deg, #0891b2, #2563eb)"
        />
        <StatCard
          title="予約投稿"
          value={String(scheduledCount)}
          icon={CalendarClock}
          description="実行待ち"
          gradient="linear-gradient(135deg, #9333ea, #ec4899)"
        />
      </div>

      {/* ── 直近の投稿 ── */}
      <div className="mt-8">
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <CardTitle className="text-base">直近の投稿</CardTitle>
            <Link
              href="/posts"
              className="text-xs font-medium"
              style={{ color: "#a78bfa" }}
            >
              すべて表示 →
            </Link>
          </div>
          {/* モバイル: カード表示 */}
          <div className="divide-y md:hidden" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            {recentPosts.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm" style={{ color: "rgba(240,238,255,0.3)" }}>
                投稿がありません
              </p>
            ) : recentPosts.map((post) => {
              const clicks = post.redirectLinks?.reduce((s, l) => s + l.clickCount, 0) ?? 0;
              const views  = post.postMetrics?.length ? (post.postMetrics[0].views ?? 0) : null;
              return (
                <Link
                  key={post.id}
                  href={`/posts/${post.id}`}
                  className="block px-4 py-3.5"
                  style={{ borderColor: "rgba(255,255,255,0.04)" }}
                >
                  <div className="flex items-start gap-3">
                    <PlatformIcon platform={post.platform as Platform} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug" style={{ color: "rgba(240,238,255,0.88)" }}>
                        {(post.contentText ?? "").slice(0, 80)}
                        {(post.contentText ?? "").length > 80 ? "…" : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]"
                        style={{ color: "rgba(240,238,255,0.55)" }}>
                        <StatusBadge status={post.status as PostStatus} />
                        <span>クリック {formatNumber(clicks)}</span>
                        <span>表示 {views !== null ? formatNumber(views) : "—"}</span>
                        <span className="ml-auto" style={{ color: "rgba(240,238,255,0.35)" }}>
                          {formatDate(post.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* PC: テーブル表示 */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["媒体", "内容", "ステータス", "クリック", "表示", "日時"].map((h, i) => (
                    <th key={h}
                      className={`px-6 py-3 text-xs font-semibold uppercase tracking-wider ${i >= 3 ? "text-right" : "text-left"}`}
                      style={{ color: "rgba(240,238,255,0.3)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentPosts.map((post) => (
                  <tr key={post.id} className="dashboard-row"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className="px-6 py-3.5">
                      <PlatformIcon platform={post.platform as Platform} />
                    </td>
                    <td className="max-w-xs px-6 py-3.5">
                      <Link
                        href={`/posts/${post.id}`}
                        className="dashboard-link"
                        style={{ color: "rgba(240,238,255,0.75)" }}
                      >
                        {(post.contentText ?? "").slice(0, 60)}
                        {(post.contentText ?? "").length > 60 ? "…" : ""}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusBadge status={post.status as PostStatus} />
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium"
                      style={{ color: "rgba(240,238,255,0.75)" }}>
                      {formatNumber(post.redirectLinks?.reduce((s, l) => s + l.clickCount, 0) ?? 0)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium"
                      style={{ color: "rgba(240,238,255,0.75)" }}>
                      {post.postMetrics?.length ? formatNumber(post.postMetrics[0].views ?? 0) : "—"}
                    </td>
                    <td className="px-6 py-3.5 text-right"
                      style={{ color: "rgba(240,238,255,0.35)" }}>
                      {formatDate(post.createdAt)}
                    </td>
                  </tr>
                ))}
                {recentPosts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center"
                      style={{ color: "rgba(240,238,255,0.3)" }}>
                      投稿がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
