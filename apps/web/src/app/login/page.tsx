"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Lock } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";

  const [password, setPassword] = useState("");
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "ログインに失敗しました");
        return;
      }
      router.push(from);
      router.refresh();
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4"
      style={{
        background: "#08080f",
        backgroundImage: "radial-gradient(ellipse 70% 50% at 50% -10%, rgba(109,40,217,0.22) 0%, transparent 60%)",
      }}>
      <div className="w-full max-w-sm space-y-8">
        {/* ロゴ */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              boxShadow: "0 0 40px rgba(139,92,246,0.45)",
            }}>
            <Zap className="h-7 w-7 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold"
            style={{
              background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
            SNS Auto
          </h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(240,238,255,0.38)" }}>
            コントロールタワー
          </p>
        </div>

        {/* フォーム */}
        <div className="rounded-2xl p-8"
          style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(139,92,246,0.18)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: "rgba(244,63,94,0.1)",
                  border: "1px solid rgba(244,63,94,0.25)",
                  color: "#fda4af",
                }}>
                {error}
              </div>
            )}
            <div>
              <label className="mb-2 flex items-center gap-1.5 text-xs font-medium"
                style={{ color: "rgba(240,238,255,0.55)" }}>
                <Lock className="h-3.5 w-3.5" />
                管理パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
                className="w-full rounded-xl px-4 py-3 text-sm transition-all"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(139,92,246,0.2)",
                  color: "#f0eeff",
                }}
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #9333ea, #a855f7)",
                boxShadow: loading || !password ? "none" : "0 0 24px rgba(139,92,246,0.45)",
              }}
            >
              {loading ? "ログイン中..." : "ログイン"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
