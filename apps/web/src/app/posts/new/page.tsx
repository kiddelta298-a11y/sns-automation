"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAccounts, createPost, type ApiAccount } from "@/lib/api";
import type { Platform } from "@/types/post";

const platforms: { value: Platform; label: string }[] = [
  { value: "threads", label: "Threads" },
  { value: "x", label: "X" },
  { value: "instagram", label: "Instagram" },
];

export default function NewPostPage() {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("threads");
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAccounts()
      .then((list) => {
        setAccounts(list);
        if (list.length > 0) setAccountId(list[0].id);
      })
      .catch(() => setAccounts([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent, asDraft: boolean) => {
    e.preventDefault();
    if (!accountId) {
      setError("アカウントが登録されていません。先にアカウントを作成してください。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createPost({
        accountId,
        platform,
        contentText: content,
        linkUrl: linkUrl || undefined,
        status: asDraft ? "draft" : "scheduled",
      });
      router.push("/posts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "投稿の作成に失敗しました");
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">新規投稿</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        新しいSNS投稿を作成
      </p>

      <Card className="mt-6 max-w-2xl">
        <CardHeader>
          <CardTitle>投稿内容</CardTitle>
        </CardHeader>

        {error && (
          <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
          {accounts.length > 0 && (
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                アカウント
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.username} ({a.platform})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              媒体
            </label>
            <div className="flex gap-2">
              {platforms.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPlatform(p.value)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    platform === p.value
                      ? "border-primary bg-accent text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="content"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              投稿本文
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="投稿内容を入力..."
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {content.length} / 500 文字
            </p>
          </div>

          <div>
            <label
              htmlFor="linkUrl"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              リンクURL（任意）
            </label>
            <input
              id="linkUrl"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting || !content.trim()}>
              予約投稿として作成
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitting || !content.trim()}
              onClick={(e) => handleSubmit(e, true)}
            >
              下書き保存
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
            >
              キャンセル
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
