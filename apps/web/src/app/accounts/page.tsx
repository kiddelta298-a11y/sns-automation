"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  type ApiAccount,
} from "@/lib/api";
import { PlusCircle, Trash2, PencilLine, X, Check } from "lucide-react";

const PLATFORMS = ["threads", "instagram", "x"] as const;
type Platform = (typeof PLATFORMS)[number];

const platformLabel: Record<Platform, string> = {
  threads: "Threads",
  instagram: "Instagram",
  x: "X",
};

const statusLabel: Record<string, string> = {
  active: "稼働中",
  paused: "一時停止",
  error: "エラー",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  paused: "secondary",
  error: "destructive",
};

// ── 新規アカウント追加フォーム ──────────────────────────────────────────
function AddAccountForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("threads");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createAccount({
        platform,
        username,
        displayName: displayName || undefined,
        credentials: { password },
      });
      setOpen(false);
      setUsername("");
      setDisplayName("");
      setPassword("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusCircle className="h-4 w-4" />
        アカウントを追加
      </Button>
    );
  }

  return (
    <Card className="max-w-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">新しいアカウントを追加</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6">
        {error && (
          <p className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">プラットフォーム</label>
          <div className="flex gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  platform === p
                    ? "border-primary bg-accent text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {platformLabel[p]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">ユーザー名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@username"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">表示名（任意）</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="表示名"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="ログインパスワード"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={submitting} size="sm">
            追加
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            キャンセル
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ── アカウント行 ─────────────────────────────────────────────────────────
function AccountRow({
  account,
  onUpdate,
  onDelete,
}: {
  account: ApiAccount;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(account.displayName ?? "");
  const [status, setStatus] = useState(account.status);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAccount(account.id, { displayName: displayName || undefined, status });
      setEditing(false);
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`@${account.username} を削除しますか？この操作は取り消せません。`)) return;
    setDeleting(true);
    try {
      await deleteAccount(account.id);
      onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pl-4 pr-2">
        <span className="inline-flex items-center rounded-full bg-accent/60 px-2.5 py-0.5 text-xs font-medium text-primary">
          {platformLabel[account.platform as Platform] ?? account.platform}
        </span>
      </td>
      <td className="px-2 py-3 text-sm font-medium text-foreground">@{account.username}</td>
      <td className="px-2 py-3 text-sm text-muted-foreground">
        {editing ? (
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
          />
        ) : (
          account.displayName ?? <span className="text-muted-foreground/50">—</span>
        )}
      </td>
      <td className="px-2 py-3">
        {editing ? (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
          >
            <option value="active">稼働中</option>
            <option value="paused">一時停止</option>
          </select>
        ) : (
          <Badge variant={statusVariant[account.status] ?? "secondary"}>
            {statusLabel[account.status] ?? account.status}
          </Badge>
        )}
      </td>
      <td className="py-3 pl-2 pr-4">
        <div className="flex items-center gap-1 justify-end">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={handleSave} disabled={saving} className="h-7 w-7 p-0">
                <Check className="h-4 w-4 text-primary" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 w-7 p-0">
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="h-7 w-7 p-0">
                <PencilLine className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDelete}
                disabled={deleting}
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────
export default function AccountsPage() {
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAccounts();
      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">アカウント管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SNSアカウントの追加・編集・削除
          </p>
        </div>
      </div>

      <div className="mt-6">
        <AddAccountForm onAdded={load} />
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : accounts.length === 0 ? (
          <Card className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              アカウントがまだ登録されていません。上のボタンから追加してください。
            </p>
          </Card>
        ) : (
          <Card>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="py-3 pl-4 pr-2 text-left">プラットフォーム</th>
                  <th className="px-2 py-3 text-left">ユーザー名</th>
                  <th className="px-2 py-3 text-left">表示名</th>
                  <th className="px-2 py-3 text-left">ステータス</th>
                  <th className="py-3 pl-2 pr-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    onUpdate={load}
                    onDelete={load}
                  />
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
