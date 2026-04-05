import type { Metadata } from "next";
import { ConditionalLayout } from "@/components/layout/conditional-layout";
import "./globals.css";

export const metadata: Metadata = {
  title: "SNS Automation",
  description: "SNS自動化システム ダッシュボード",
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
