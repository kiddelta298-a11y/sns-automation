"use client";

import { useState, useEffect } from "react";
import { Cpu, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getScraperEngine, setScraperEngine, type ScraperEngine } from "@/lib/api";

export function ScraperEngineToggle() {
  const [engine, setEngine] = useState<ScraperEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getScraperEngine()
      .then((r) => setEngine(r.engine))
      .catch(() => setError("エンジン設定の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async () => {
    if (!engine || switching) return;
    const next: ScraperEngine = engine === "playwright" ? "scrapling" : "playwright";
    setSwitching(true);
    setError(null);
    try {
      const r = await setScraperEngine(next);
      setEngine(r.engine);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エンジン切替に失敗しました");
    } finally {
      setSwitching(false);
    }
  };

  const isScrapling = engine === "scrapling";

  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
        <Cpu className="h-5 w-5 text-primary" />
        スクレイパーエンジン
      </h2>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                スクレイパーエンジン切替
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Threadsデータ収集に使用するブラウザエンジンを選択します。
                {!loading && engine && (
                  <span
                    className={cn(
                      "ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      isScrapling
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-blue-100 text-blue-700",
                    )}
                  >
                    現在: {isScrapling ? "Scrapling" : "Playwright"}
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span
                className={cn(
                  "text-xs font-medium transition-colors",
                  !isScrapling && !loading ? "text-foreground" : "text-muted-foreground",
                )}
              >
                Playwright
              </span>

              <button
                onClick={handleToggle}
                disabled={loading || switching}
                role="switch"
                aria-checked={isScrapling}
                aria-label="スクレイパーエンジン: Playwright / Scrapling"
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  isScrapling ? "bg-primary" : "bg-muted",
                  (loading || switching) && "opacity-50 cursor-not-allowed",
                )}
              >
                {switching ? (
                  <Loader2 className="absolute left-1/2 -translate-x-1/2 h-3 w-3 animate-spin text-white" />
                ) : (
                  <span
                    className={cn(
                      "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                      isScrapling ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                )}
              </button>

              <span
                className={cn(
                  "text-xs font-medium transition-colors",
                  isScrapling && !loading ? "text-foreground" : "text-muted-foreground",
                )}
              >
                Scrapling
              </span>
            </div>
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
