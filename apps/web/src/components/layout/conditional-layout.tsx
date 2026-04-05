"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";

const NO_SIDEBAR_PATHS = ["/login"];

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = !NO_SIDEBAR_PATHS.includes(pathname);

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <main className="ml-64 min-h-screen p-8 max-w-[calc(100vw-16rem)]">
        <div className="max-w-6xl">
          {children}
        </div>
      </main>
    </>
  );
}
