import type { Metadata, Viewport } from "next";
import { ConditionalLayout } from "@/components/layout/conditional-layout";
import "./globals.css";

export const metadata: Metadata = {
  title: "SNS コントロールタワー",
  description: "SNS投稿の自動収集・分析・投稿管理システム",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-background font-sans text-foreground antialiased">
        <ConditionalLayout>{children}</ConditionalLayout>
      </body>
    </html>
  );
}
