"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAccounts, createPost, uploadImage, type ApiAccount } from "@/lib/api";
import type { Platform } from "@/types/post";
import { ImagePlus, X } from "lucide-react";

const platforms: { value: Platform; label: string }[] = [
  { value: "threads", label: "Threads" },
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X" },
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

  // Image upload state (Instagram)
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAccounts()
      .then((list) => {
        setAccounts(list);
        if (list.length > 0) setAccountId(list[0].id);
      })
      .catch(() => setAccounts([]));
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploads = await Promise.all(files.map((f) => uploadImage(f)));
      setImageUrls((prev) => [...prev, ...uploads.map((u) => u.url)]);
      setImagePreviews((prev) => [
        ...prev,
        ...files.map((f) => URL.createObjectURL(f)),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像のアップロードに失敗しました");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent, asDraft: boolean) => {
    e.preventDefault();
    if (!accountId) {
      setError("アカウントが登録されていません。先にアカウントを作成してください。");
      return;
    }
    if (platform === "instagram" && imageUrls.length === 0 && !asDraft) {
      setError("Instagramの投稿には画像が必要です。");
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
        metadata: platform === "instagram" && imageUrls.length > 0
          ? { imagePaths: imageUrls }
          : undefined,
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

          {/* 画像アップロード（Instagram専用） */}
          {platform === "instagram" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                画像（最低1枚必須）
              </label>
              <div className="space-y-3">
                {imagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {imagePreviews.map((src, i) => (
                      <div key={i} className="relative h-24 w-24">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={`preview ${i + 1}`}
                          className="h-24 w-24 rounded-lg object-cover border border-border"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    id="image-upload"
                  />
                  <label
                    htmlFor="image-upload"
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground ${
                      uploading ? "pointer-events-none opacity-50" : ""
                    }`}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {uploading ? "アップロード中..." : "画像を選択"}
                  </label>
                </div>
              </div>
            </div>
          )}

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
