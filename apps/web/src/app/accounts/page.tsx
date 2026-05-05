"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  updateAccountProxy,
  testAccountProxy,
  uploadAccountSession,
  deleteAccountSession,
  type ApiAccount,
  type ApiProxyConfig,
} from "@/lib/api";
import Link from "next/link";
import {
  PlusCircle,
  Trash2,
  PencilLine,
  X,
  Check,
  BarChart3,
  KeyRound,
  Shield,
  Upload,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

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
        // X は storageState 方式なので password 空でも OK
        credentials: password ? { password } : {},
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
          <label className="mb-1 block text-sm font-medium">
            パスワード{platform === "x" && <span className="text-muted-foreground">（Xは任意）</span>}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={platform === "x" ? "空のままでも可（セッション方式）" : "ログインパスワード"}
            required={platform !== "x"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {platform === "x" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Xはパスワードではなく、ローカルCLIで出力した storageState をアップロードして認証します。
            </p>
          )}
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

// ── セッション / プロキシ詳細パネル ─────────────────────────────────────
function AccountDetailsPanel({
  account,
  onChanged,
}: {
  account: ApiAccount;
  onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [server, setServer] = useState(account.proxyConfig?.server ?? "");
  const [proxyUser, setProxyUser] = useState(account.proxyConfig?.username ?? "");
  const [proxyPass, setProxyPass] = useState("");
  const [label, setLabel] = useState(account.proxyConfig?.label ?? "");
  const [proxySaving, setProxySaving] = useState(false);
  const [proxyMsg, setProxyMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadErr(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      await uploadAccountSession(account.id, parsed);
      onChanged();
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDeleteSession = async () => {
    if (!confirm("保存済みセッションを削除しますか？")) return;
    await deleteAccountSession(account.id);
    onChanged();
  };

  const handleSaveProxy = async () => {
    setProxySaving(true);
    setProxyMsg(null);
    try {
      if (!server) {
        await updateAccountProxy(account.id, null);
        setProxyMsg("プロキシ設定を解除しました");
      } else {
        const cfg: ApiProxyConfig = {
          server,
          username: proxyUser || undefined,
          // 空なら既存値を保持するためサーバ側にそのまま投げないが、簡便のため空でも送信
          password: proxyPass || undefined,
          label: label || undefined,
        };
        await updateAccountProxy(account.id, cfg);
        setProxyMsg("プロキシ設定を保存しました");
      }
      onChanged();
    } catch (err) {
      setProxyMsg(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setProxySaving(false);
    }
  };

  const handleTestProxy = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testAccountProxy(account.id);
      if (res.ok && res.ip) setTestResult(`OK: 外部IP = ${res.ip}`);
      else setTestResult(`NG: ${res.error ?? "不明なエラー"}`);
    } catch (err) {
      setTestResult(`NG: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 border-t border-border bg-muted/30 px-4 py-5">
      {/* セッション管理 */}
      <section>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4" /> ログインセッション
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          {account.hasSession ? (
            <Badge variant="default">ログイン済み</Badge>
          ) : (
            <Badge variant="secondary">未ログイン</Badge>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="gap-1"
          >
            <Upload className="h-3.5 w-3.5" />
            storageState をアップロード
          </Button>
          {account.hasSession && (
            <Button size="sm" variant="ghost" onClick={handleDeleteSession}>
              セッション削除
            </Button>
          )}
        </div>
        {uploadErr && <p className="mt-2 text-xs text-destructive">{uploadErr}</p>}
        {account.platform === "x" && (
          <p className="mt-2 text-xs text-muted-foreground">
            ローカルで <code className="rounded bg-muted px-1">pnpm --filter @sns-automation/worker x-login @{account.username}</code> を実行し、
            生成された JSON をアップロードしてください。
          </p>
        )}
      </section>

      {/* プロキシ設定 */}
      <section>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4" /> プロキシ設定（IPローテーション）
        </h4>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium">サーバーURL</label>
            <input
              type="text"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="http://proxy.example.com:8080"
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">ラベル（任意）</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="東京-1"
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">ユーザー名</label>
            <input
              type="text"
              value={proxyUser}
              onChange={(e) => setProxyUser(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              パスワード
              {account.proxyConfig?.password && (
                <span className="ml-1 text-muted-foreground">（既存あり・変更する場合のみ入力）</span>
              )}
            </label>
            <input
              type="password"
              value={proxyPass}
              onChange={(e) => setProxyPass(e.target.value)}
              placeholder={account.proxyConfig?.password ? "••••••" : ""}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={handleSaveProxy} disabled={proxySaving}>
            保存
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleTestProxy}
            disabled={testing || !account.proxyConfig?.server}
          >
            {testing ? "テスト中..." : "接続テスト"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setServer("");
              setProxyUser("");
              setProxyPass("");
              setLabel("");
            }}
          >
            フォームをクリア
          </Button>
        </div>
        {proxyMsg && <p className="mt-2 text-xs text-muted-foreground">{proxyMsg}</p>}
        {testResult && (
          <p
            className={`mt-1 text-xs ${
              testResult.startsWith("OK") ? "text-primary" : "text-destructive"
            }`}
          >
            {testResult}
          </p>
        )}
      </section>
    </div>
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
  const [expanded, setExpanded] = useState(false);
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
    <>
      <tr className="border-b border-border last:border-0">
        <td className="py-3 pl-4 pr-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="詳細を開く"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="py-3 px-2">
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
          {account.hasSession ? (
            <Badge variant="default" className="gap-1">
              <KeyRound className="h-3 w-3" /> 済
            </Badge>
          ) : (
            <Badge variant="secondary">未</Badge>
          )}
        </td>
        <td className="px-2 py-3">
          {account.proxyConfig?.server ? (
            <span title={account.proxyConfig.server}>
              <Badge variant="default" className="gap-1">
                <Shield className="h-3 w-3" />
                {account.proxyConfig.label ?? "設定済み"}
              </Badge>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/60">—</span>
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
                <Link href={`/accounts/${account.id}`}>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                </Link>
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
      {expanded && (
        <tr>
          <td colSpan={8} className="p-0">
            <AccountDetailsPanel account={account} onChanged={onUpdate} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────
export default function AccountsPage() {
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Platform | "all">("all");

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

  const filtered = filter === "all" ? accounts : accounts.filter((a) => a.platform === filter);
  const count = (p: Platform | "all") =>
    p === "all" ? accounts.length : accounts.filter((a) => a.platform === p).length;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">アカウント管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SNSアカウントの追加・編集・削除、ログインセッション、プロキシ設定
          </p>
        </div>
      </div>

      <div className="mt-6">
        <AddAccountForm onAdded={load} />
      </div>

      <div className="mt-6 flex gap-2">
        {(["all", ...PLATFORMS] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFilter(p)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === p
                ? "border-primary bg-accent text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {p === "all" ? "すべて" : platformLabel[p]} ({count(p)})
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : filtered.length === 0 ? (
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
                  <th className="py-3 pl-4 pr-2 text-left w-8"></th>
                  <th className="py-3 px-2 text-left">プラットフォーム</th>
                  <th className="px-2 py-3 text-left">ユーザー名</th>
                  <th className="px-2 py-3 text-left">表示名</th>
                  <th className="px-2 py-3 text-left">セッション</th>
                  <th className="px-2 py-3 text-left">プロキシ</th>
                  <th className="px-2 py-3 text-left">ステータス</th>
                  <th className="py-3 pl-2 pr-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((account) => (
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
