"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPostById, updatePost } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

const EDITABLE_STATUSES = ["draft", "scheduled"];

export default function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [postId, setPostId] = useState<string | null>(null);
  const [contentText, setContentText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      setPostId(id);
      return getPostById(id);
    }).then((post) => {
      if (!EDITABLE_STATUSES.includes(post.status)) {
        router.replace(`/posts/${post.id}`);
        return;
      }
      setContentText(post.contentText ?? "");
      setLinkUrl(post.linkUrl ?? "");
      setStatus(post.status);
    }).catch(() => {
      setError("投稿の読み込みに失敗しました");
    }).finally(() => {
      setLoading(false);
    });
  }, [params, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postId) return;
    setSubmitting(true);
    setError(null);
    try {
      await updatePost(postId, {
        contentText,
        linkUrl: linkUrl || undefined,
        status,
      });
      router.push(`/posts/${postId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">読み込み中...</p>;
  }

  return (
    <div>
      <Link
        href={postId ? `/posts/${postId}` : "/posts"}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        投稿詳細に戻る
      </Link>

      <h1 className="text-2xl font-bold text-foreground">投稿を編集</h1>

      <Card className="mt-6 max-w-2xl">
        <CardHeader>
          <CardTitle>投稿内容を編集</CardTitle>
        </CardHeader>

        {error && (
          <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              ステータス
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="draft">下書き</option>
              <option value="scheduled">予約済み</option>
            </select>
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
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {contentText.length} / 500 文字
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
            <Button type="submit" disabled={submitting || !contentText.trim()}>
              保存
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
