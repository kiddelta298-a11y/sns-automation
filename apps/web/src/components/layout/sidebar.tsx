"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  Settings,
  TrendingUp,
  Users,
  CalendarDays,
  Megaphone,
  AlertCircle,
  LogOut,
  Tags,
  Zap,
  FlaskConical,
  Trophy,
  Layers,
  Sparkles,
  Brain,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getErrorPosts } from "@/lib/api";

const navItems = [
  { href: "/",           label: "ダッシュボード",   icon: LayoutDashboard },
  { href: "/mentor",     label: "X-Mentor",         icon: Sparkles },
  { href: "/x-algorithm", label: "Xアルゴリズム",   icon: Brain },
  { href: "/trends",     label: "トレンド分析",     icon: TrendingUp },
  { href: "/keywords",   label: "キーワード収集",   icon: Tags },
  { href: "/research",   label: "ジャンル別リサーチ", icon: FlaskConical },
  { href: "/performance", label: "パフォーマンス",   icon: Trophy },
  { href: "/account-groups", label: "マルチアカウント", icon: Layers },
  { href: "/posts",      label: "投稿一覧",         icon: FileText },
  { href: "/posts/new",  label: "新規投稿",         icon: PlusCircle },
  { href: "/calendar",   label: "カレンダー",       icon: CalendarDays },
  { href: "/campaigns",  label: "キャンペーン",     icon: Megaphone },
  { href: "/errors",     label: "エラー通知",       icon: AlertCircle },
  { href: "/accounts",   label: "アカウント管理",   icon: Users },
  { href: "/settings",   label: "設定",             icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router  = useRouter();
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    const fetchErrors = () =>
      getErrorPosts().then((e) => setErrorCount(e.length)).catch(() => {});
    fetchErrors();
    const t = setInterval(fetchErrors, 120_000);
    return () => clearInterval(t);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col"
      style={{
        background: "linear-gradient(180deg, rgba(13,10,25,0.98) 0%, rgba(10,8,20,0.98) 100%)",
        borderRight: "1px solid rgba(139,92,246,0.12)",
        backdropFilter: "blur(20px)",
      }}>

      {/* ── ロゴ ── */}
      <div className="flex h-16 items-center gap-3 px-5"
        style={{ borderBottom: "1px solid rgba(139,92,246,0.1)" }}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #a855f7)",
            boxShadow: "0 0 16px rgba(139,92,246,0.45)",
          }}>
          <Zap className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-sm font-bold leading-none"
            style={{
              background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
            SNS Auto
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "rgba(240,238,255,0.35)" }}>
            コントロールタワー
          </p>
        </div>
      </div>

      {/* ── ナビゲーション ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 relative",
              )}
              style={isActive ? {
                background: "linear-gradient(135deg, rgba(124,58,237,0.28) 0%, rgba(168,85,247,0.14) 100%)",
                color: "#c4b5fd",
                borderLeft: "2px solid rgba(167,139,250,0.7)",
              } : {
                color: "rgba(240,238,255,0.45)",
                borderLeft: "2px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.08)";
                  (e.currentTarget as HTMLElement).style.color = "rgba(240,238,255,0.85)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "";
                  (e.currentTarget as HTMLElement).style.color = "rgba(240,238,255,0.45)";
                }
              }}
            >
              <item.icon className={cn("h-4 w-4 shrink-0 transition-colors")} />
              <span>{item.label}</span>

              {/* エラーバッジ */}
              {item.href === "/errors" && errorCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #f43f5e, #e11d48)" }}>
                  {errorCount > 99 ? "99+" : errorCount}
                </span>
              )}

              {/* アクティブインジケーター */}
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full"
                  style={{ background: "linear-gradient(135deg, #a78bfa, #f0abfc)" }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── フッター ── */}
      <div className="px-3 pb-4 pt-3 space-y-1"
        style={{ borderTop: "1px solid rgba(139,92,246,0.1)" }}>
        <p className="px-3 text-[10px]" style={{ color: "rgba(240,238,255,0.22)" }}>
          SNS Automation v0.1.0
        </p>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs transition-all"
          style={{ color: "rgba(240,238,255,0.38)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(244,63,94,0.1)";
            (e.currentTarget as HTMLElement).style.color = "#f43f5e";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "";
            (e.currentTarget as HTMLElement).style.color = "rgba(240,238,255,0.38)";
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
          ログアウト
        </button>
      </div>
    </aside>
  );
}
