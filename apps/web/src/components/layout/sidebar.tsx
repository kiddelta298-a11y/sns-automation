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
} from "lucide-react";
import { useEffect, useState } from "react";
import { getErrorPosts } from "@/lib/api";

const navItems = [
  { href: "/", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/trends", label: "トレンド分析", icon: TrendingUp },
  { href: "/posts", label: "投稿一覧", icon: FileText },
  { href: "/posts/new", label: "新規投稿", icon: PlusCircle },
  { href: "/calendar", label: "カレンダー", icon: CalendarDays },
  { href: "/campaigns", label: "キャンペーン", icon: Megaphone },
  { href: "/errors", label: "エラー通知", icon: AlertCircle },
  { href: "/accounts", label: "アカウント管理", icon: Users },
  { href: "/settings", label: "設定", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    getErrorPosts()
      .then((errors) => setErrorCount(errors.length))
      .catch(() => {});
    // Refresh every 2 minutes
    const t = setInterval(() => {
      getErrorPosts().then((errors) => setErrorCount(errors.length)).catch(() => {});
    }, 120_000);
    return () => clearInterval(t);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
          S
        </div>
        <span className="text-lg font-bold text-foreground">SNS Auto</span>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
              {item.href === "/errors" && errorCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {errorCount > 99 ? "99+" : errorCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4 space-y-2">
        <p className="text-xs text-muted-foreground">SNS Automation v0.1.0</p>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          ログアウト
        </button>
      </div>
    </aside>
  );
}
