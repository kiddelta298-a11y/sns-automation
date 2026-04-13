"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sidebar } from "./sidebar";

const NO_SIDEBAR_PATHS = ["/login"];
const STORAGE_KEY = "sns-sidebar-desktop-open";

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = !NO_SIDEBAR_PATHS.includes(pathname);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v !== null) setDesktopOpen(v === "1");
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, desktopOpen ? "1" : "0");
    } catch {}
  }, [desktopOpen, hydrated]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (!showSidebar) {
    return <>{children}</>;
  }

  const toggleSidebar = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setMobileOpen((v) => !v);
    } else {
      setDesktopOpen((v) => !v);
    }
  };

  return (
    <>
      {/* 共通ヘッダー: モバイルは常時、デスクトップはサイドバー閉時のみ表示 */}
      <header
        className={`sticky top-0 z-40 flex h-14 items-center gap-3 px-4 ${
          desktopOpen ? "md:hidden" : ""
        }`}
        style={{
          background: "rgba(13,10,25,0.92)",
          borderBottom: "1px solid rgba(139,92,246,0.14)",
          backdropFilter: "blur(16px)",
        }}
      >
        <button
          type="button"
          aria-label="サイドバーを開閉"
          aria-expanded={mobileOpen || desktopOpen}
          onClick={toggleSidebar}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: "rgba(139,92,246,0.14)",
            color: "#c4b5fd",
            border: "1px solid rgba(139,92,246,0.24)",
          }}
        >
          <span className="md:hidden">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </span>
          <span className="hidden md:inline">
            <PanelLeftOpen className="h-5 w-5" />
          </span>
        </button>
        <p
          className="truncate text-sm font-bold"
          style={{
            background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          SNS コントロールタワー
        </p>
      </header>

      {/* デスクトップ: サイドバー展開中のフローティング閉じるボタン */}
      {desktopOpen && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="サイドバーを閉じる"
          className="fixed left-[15.75rem] top-4 z-[60] hidden h-8 w-8 items-center justify-center rounded-lg md:flex"
          style={{
            background: "rgba(13,10,25,0.85)",
            color: "#c4b5fd",
            border: "1px solid rgba(139,92,246,0.28)",
            backdropFilter: "blur(12px)",
          }}
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      )}

      <Sidebar
        open={mobileOpen}
        desktopOpen={desktopOpen}
        onClose={() => setMobileOpen(false)}
      />

      <main
        className={`min-h-screen p-3 sm:p-4 md:p-8 transition-[margin] duration-200 ease-out ${
          desktopOpen ? "md:ml-64 md:max-w-[calc(100vw-16rem)]" : "md:ml-0 md:max-w-full"
        }`}
      >
        <div className="mx-auto w-full min-w-0 max-w-6xl">{children}</div>
      </main>
    </>
  );
}
