"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  type ApiCampaign,
} from "@/lib/api";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PlusCircle, Trash2, PencilLine, X, Check, Copy, Megaphone } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  active: "稼働中",
  paused: "一時停止",
  completed: "完了",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  paused: "secondary",
  completed: "secondary",
};

function UTMBuilder({ utmCampaign }: { utmCampaign: string }) {
  const [baseUrl, setBaseUrl] = useState("");
  const [source, setSource] = useState("threads");
  const [medium, setMedium] = useState("social");
  const [copied, setCopied] = useState(false);

  const utmUrl = baseUrl
    ? `${baseUrl}?utm_source=${encodeURIComponent(source)}&utm_medium=${encodeURIComponent(medium)}&utm_campaign=${encodeURIComponent(utmCampaign)}`
    : "";

  const copy = () => {
    if (!utmUrl) return;
    navigator.clipboard.writeText(utmUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-3 rounded-lg bg-muted/40 p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">UTMリンクビルダー</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">ベースURL</label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">utm_source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
          >
            <option value="threads">threads</option>
            <option value="instagram">instagram</option>
            <option value="x">x</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">utm_medium</label>
          <input
            type="text"
            value={medium}
            onChange={(e) => setMedium(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
          />
        </div>
      </div>
      {utmUrl && (
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-background px-2 py-1.5 text-[11px] text-muted-foreground border border-border">
            {utmUrl}
          </code>
          <button
            onClick={copy}
            className="flex items-center gap-1 rounded bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
          >
            <Copy className="h-3 w-3" />
            {copied ? "コピー済" : "コピー"}
          </button>
        </div>
      )}
    </div>
  );
}

function CampaignRow({
  campaign,
  onUpdate,
  onDelete,
}: {
  campaign: ApiCampaign;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(campaign.name);
  const [startDate, setStartDate] = useState(campaign.startDate ?? "");
  const [endDate, setEndDate] = useState(campaign.endDate ?? "");
  const [goalRegistrations, setGoalRegistrations] = useState(
    campaign.goalRegistrations != null ? String(campaign.goalRegistrations) : "",
  );
  const [status, setStatus] = useState(campaign.status);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCampaign(campaign.id, {
        name,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        goalRegistrations: goalRegistrations ? Number(goalRegistrations) : undefined,
        status,
      });
      setEditing(false);
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`「${campaign.name}」を削除しますか？`)) return;
    setDeleting(true);
    try {
      await deleteCampaign(campaign.id);
      onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const postCount = campaign.posts?.length ?? 0;

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2">
            {editing ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="rounded border border-border bg-background px-2 py-1 text-sm font-medium focus:border-primary focus:outline-none"
              />
            ) : (
              <span className="text-sm font-medium text-foreground truncate">{campaign.name}</span>
            )}
            {editing ? (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="rounded border border-border bg-background px-1.5 py-0.5 text-xs focus:border-primary focus:outline-none"
              >
                <option value="active">稼働中</option>
                <option value="paused">一時停止</option>
                <option value="completed">完了</option>
              </select>
            ) : (
              <Badge variant={STATUS_VARIANT[campaign.status] ?? "secondary"}>
                {STATUS_LABEL[campaign.status] ?? campaign.status}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            utm_campaign: <code className="text-primary">{campaign.utmCampaign}</code>
            {" · "}投稿数: {postCount}件
          </p>
        </button>

        <div className="flex items-center gap-1 shrink-0">
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
                size="sm" variant="ghost"
                onClick={handleDelete}
                disabled={deleting}
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 展開: 詳細 + UTMビルダー */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 text-xs text-muted-foreground">
            {editing ? (
              <>
                <div>
                  <label className="mb-1 block font-medium">開始日</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1 focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block font-medium">終了日</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1 focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block font-medium">目標登録数</label>
                  <input type="number" value={goalRegistrations} onChange={(e) => setGoalRegistrations(e.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1 focus:border-primary focus:outline-none" />
                </div>
              </>
            ) : (
              <>
                <div><span className="font-medium">開始日:</span> {campaign.startDate ?? "未設定"}</div>
                <div><span className="font-medium">終了日:</span> {campaign.endDate ?? "未設定"}</div>
                <div><span className="font-medium">目標登録数:</span> {campaign.goalRegistrations ?? "未設定"}</div>
              </>
            )}
          </div>
          <UTMBuilder utmCampaign={campaign.utmCampaign} />
        </div>
      )}
    </div>
  );
}

function AddCampaignForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [goalRegistrations, setGoalRegistrations] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createCampaign({
        name,
        utmCampaign,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        goalRegistrations: goalRegistrations ? Number(goalRegistrations) : undefined,
      });
      setOpen(false);
      setName(""); setUtmCampaign(""); setStartDate(""); setEndDate(""); setGoalRegistrations("");
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
        キャンペーンを追加
      </Button>
    );
  }

  return (
    <Card className="max-w-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">新しいキャンペーンを追加</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} className="space-y-3 px-6 pb-6">
        {error && <p className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
        <div>
          <label className="mb-1 block text-sm font-medium">キャンペーン名</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
            placeholder="春のプロモーション2025"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">UTMキャンペーン名</label>
          <input type="text" value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} required
            placeholder="spring_promo_2025"
            pattern="[a-z0-9_-]+"
            title="英小文字・数字・ハイフン・アンダースコアのみ"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <p className="mt-0.5 text-[11px] text-muted-foreground">英小文字・数字・ハイフン・アンダースコアのみ</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-sm font-medium">開始日</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">終了日</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">目標登録数（任意）</label>
          <input type="number" value={goalRegistrations} onChange={(e) => setGoalRegistrations(e.target.value)} min={0}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={submitting} size="sm">追加</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>キャンセル</Button>
        </div>
      </form>
    </Card>
  );
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<ApiCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await getCampaigns());
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            キャンペーン・UTM管理
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            キャンペーンを管理し、UTMリンクを生成します
          </p>
        </div>
      </div>

      <div className="mt-6">
        <AddCampaignForm onAdded={load} />
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : campaigns.length === 0 ? (
          <Card className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              キャンペーンがまだありません。上のボタンから追加してください。
            </p>
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-border">
              {campaigns.map((c) => (
                <CampaignRow key={c.id} campaign={c} onUpdate={load} onDelete={load} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
