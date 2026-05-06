"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2, Plus, Copy, Check, Trash2, ExternalLink, Edit3,
  Tag as TagIcon, AlertCircle, Users,
} from "lucide-react";
import {
  getAffiliateLinks,
  createAffiliateLink,
  updateAffiliateLink,
  deleteAffiliateLink,
  getAccounts,
  type ApiAffiliateLink,
  type ApiAccount,
} from "@/lib/api";

// "全件" / 個別アカウントID / "shared"(=未割当) を表す
type AccountFilter = "all" | "shared" | string;

const GLASS = {
  card: { background: "rgba(15,12,30,0.7)", border: "1px solid rgba(139,92,246,0.15)" },
  inner: { background: "rgba(15,12,30,0.5)", border: "1px solid rgba(139,92,246,0.1)" },
  input: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(139,92,246,0.2)",
    color: "rgba(240,238,255,0.85)",
  },
  btnPrimary: {
    background: "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(168,85,247,0.4))",
    border: "1px solid rgba(139,92,246,0.5)",
    color: "#e9d5ff",
  },
  btnGhost: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(139,92,246,0.2)",
    color: "rgba(240,238,255,0.7)",
  },
} as const;

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: "rgba(34,197,94,0.15)", color: "#4ade80", label: "稼働中" },
  paused: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24", label: "停止中" },
  dead: { bg: "rgba(244,63,94,0.15)", color: "#fb7185", label: "終了" },
};

function shortRedirectUrl(slug: string): string {
  if (typeof window === "undefined") return `/r/${slug}`;
  // 直接APIに飛ばす（同じドメインを使うか別か運用次第）
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
  if (apiBase) return `${apiBase.replace(/\/$/, "")}/r/${slug}`;
  return `${window.location.origin.replace("3004", "3000")}/r/${slug}`;
}

export default function AffiliateLinksPage() {
  const [links, setLinks] = useState<ApiAffiliateLink[]>([]);
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<AccountFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [caseName, setCaseName] = useState("");
  const [asp, setAsp] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [genre, setGenre] = useState("");
  const [unitPayout, setUnitPayout] = useState<string>("");
  const [memo, setMemo] = useState("");
  // フォーム上の紐付けアカウント。"" = 共有、UUID = そのアカウントに紐付け
  const [formAccountId, setFormAccountId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // タブ選択に応じてサーバ側でフィルタ
      const opts =
        activeAccount === "all" ? undefined :
        activeAccount === "shared" ? { accountId: null as null } :
        { accountId: activeAccount };
      const [data, accs] = await Promise.all([
        getAffiliateLinks(opts),
        getAccounts(),
      ]);
      setLinks(data);
      setAccounts(accs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込み失敗");
    } finally {
      setLoading(false);
    }
  }, [activeAccount]);

  useEffect(() => { void load(); }, [load]);

  const reset = () => {
    setCaseName(""); setAsp(""); setTrackingUrl(""); setGenre("");
    setUnitPayout(""); setMemo(""); setEditingId(null); setShowForm(false);
    // 新規追加時は、現在選択中のタブを初期値に
    setFormAccountId(activeAccount !== "all" && activeAccount !== "shared" ? activeAccount : "");
  };

  const handleEdit = (link: ApiAffiliateLink) => {
    setEditingId(link.id);
    setCaseName(link.case_name);
    setAsp(link.asp);
    setTrackingUrl(link.tracking_url);
    setGenre(link.genre ?? "");
    setUnitPayout(link.unit_payout != null ? String(link.unit_payout) : "");
    setMemo(link.memo ?? "");
    setFormAccountId(link.account_id ?? "");
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!caseName.trim() || !asp.trim() || !trackingUrl.trim()) {
      setError("案件名・ASP・tracking URL は必須です");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const accountIdField: { accountId: string | null } = {
        accountId: formAccountId ? formAccountId : null,
      };
      if (editingId) {
        await updateAffiliateLink(editingId, {
          caseName: caseName.trim(),
          asp: asp.trim(),
          trackingUrl: trackingUrl.trim(),
          genre: genre.trim() || undefined,
          unitPayout: unitPayout ? Number(unitPayout) : undefined,
          memo: memo.trim() || undefined,
          ...accountIdField,
        });
      } else {
        await createAffiliateLink({
          caseName: caseName.trim(),
          asp: asp.trim(),
          trackingUrl: trackingUrl.trim(),
          genre: genre.trim() || undefined,
          unitPayout: unitPayout ? Number(unitPayout) : undefined,
          memo: memo.trim() || undefined,
          ...accountIdField,
        });
      }
      reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失敗");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この案件を削除しますか？関連するクリックログは残ります。")) return;
    try {
      await deleteAffiliateLink(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除失敗");
    }
  };

  const handleStatusToggle = async (link: ApiAffiliateLink, next: "active" | "paused" | "dead") => {
    try {
      await updateAffiliateLink(link.id, { status: next });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ステータス更新失敗");
    }
  };

  const handleCopy = async (slug: string) => {
    const url = shortRedirectUrl(slug);
    await navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 1500);
  };

  return (
    <div className="min-h-screen p-6 space-y-6"
      style={{ background: "linear-gradient(180deg, #0a0819 0%, #0d0a1e 100%)" }}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" style={{
              background: "linear-gradient(135deg, #c4b5fd, #f0abfc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              アフィリエイトリンク
            </h1>
            <p className="text-sm mt-1" style={{ color: "rgba(240,238,255,0.55)" }}>
              アカウントごとにアフィリエイトリンクを管理。短縮URLでクリック・CV・売上を集計
            </p>
          </div>
          <button
            onClick={() => { reset(); setShowForm(true); }}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all"
            style={GLASS.btnPrimary}
          >
            <Plus className="h-4 w-4" />
            新規追加
          </button>
        </div>

        {/* アカウント別タブ */}
        <div className="flex items-center gap-2 flex-wrap">
          <Users className="h-4 w-4" style={{ color: "rgba(240,238,255,0.4)" }} />
          {(["all", "shared", ...accounts.map((a) => a.id)] as AccountFilter[]).map((key) => {
            const isActive = activeAccount === key;
            let label: string;
            if (key === "all") label = "全件";
            else if (key === "shared") label = "未割当（共有）";
            else {
              const acc = accounts.find((a) => a.id === key);
              label = acc ? `@${acc.username}` : key.slice(0, 8);
            }
            return (
              <button
                key={key}
                onClick={() => setActiveAccount(key)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                style={{
                  background: isActive ? "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(168,85,247,0.4))" : "rgba(255,255,255,0.04)",
                  border: isActive ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(139,92,246,0.18)",
                  color: isActive ? "#e9d5ff" : "rgba(240,238,255,0.6)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="rounded-lg px-3 py-2 text-sm flex items-center gap-2"
            style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.4)", color: "#fda4af" }}>
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {showForm && (
          <div className="rounded-2xl p-5 space-y-3" style={GLASS.card}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>案件名 *</label>
                <input value={caseName} onChange={(e) => setCaseName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={GLASS.input} />
              </div>
              <div>
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>ASP * (A8/バリュコマ等)</label>
                <input value={asp} onChange={(e) => setAsp(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={GLASS.input} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>Tracking URL *</label>
                <input type="url" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={GLASS.input}
                  placeholder="https://..." />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>
                  紐付けアカウント
                </label>
                <select
                  value={formAccountId}
                  onChange={(e) => setFormAccountId(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1"
                  style={GLASS.input}
                >
                  <option value="">未割当（共有・全アカウント共通）</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      @{a.username}（{a.platform}）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>ジャンル</label>
                <input value={genre} onChange={(e) => setGenre(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={GLASS.input} />
              </div>
              <div>
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>想定単価（円）</label>
                <input type="number" value={unitPayout} onChange={(e) => setUnitPayout(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={GLASS.input} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>メモ</label>
                <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1 resize-none" style={GLASS.input} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSubmit} disabled={submitting}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={GLASS.btnPrimary}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {editingId ? "更新" : "作成"}
              </button>
              <button onClick={reset} className="rounded-xl px-4 py-2 text-sm" style={GLASS.btnGhost}>
                キャンセル
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#a78bfa" }} />
          </div>
        ) : links.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={GLASS.card}>
            <TagIcon className="h-10 w-10 mx-auto mb-3" style={{ color: "rgba(139,92,246,0.3)" }} />
            <p className="text-sm" style={{ color: "rgba(240,238,255,0.5)" }}>
              まだ案件が登録されていません。「新規追加」から始めてください。
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={GLASS.card}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(139,92,246,0.15)" }}>
                    {["案件名", "ASP", "短縮URL", "単価", "状態", "クリック", "CV", "売上", ""].map((h, i) => (
                      <th key={i} className={`px-3 py-3 text-xs font-semibold ${i >= 3 && i <= 7 ? "text-right" : "text-left"}`}
                        style={{ color: "rgba(240,238,255,0.5)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => {
                    const stColor = STATUS_COLORS[link.status] ?? STATUS_COLORS.active;
                    const acc = link.account_id ? accounts.find((a) => a.id === link.account_id) : null;
                    return (
                      <tr key={link.id} style={{ borderBottom: "1px solid rgba(139,92,246,0.06)" }}>
                        <td className="px-3 py-3" style={{ color: "rgba(240,238,255,0.85)" }}>
                          <div className="font-medium">{link.case_name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {acc ? (
                              <span className="text-[10px] rounded px-1.5 py-0.5"
                                style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }}>
                                @{acc.username}
                              </span>
                            ) : (
                              <span className="text-[10px]" style={{ color: "rgba(240,238,255,0.35)" }}>
                                未割当（共有）
                              </span>
                            )}
                            {link.genre && (
                              <span className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>
                                · {link.genre}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3" style={{ color: "rgba(240,238,255,0.7)" }}>{link.asp}</td>
                        {/* genre は案件名セル内に統合表示するためここからは外しても見た目は変わらないが、列ヘッダの整合は保つ */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <code className="text-xs rounded px-2 py-1" style={{ background: "rgba(139,92,246,0.12)", color: "#c4b5fd" }}>
                              /r/{link.short_slug}
                            </code>
                            <button onClick={() => handleCopy(link.short_slug)} className="text-xs rounded p-1.5"
                              style={GLASS.btnGhost} title="短縮URLをコピー">
                              {copiedSlug === link.short_slug ? <Check className="h-3 w-3" style={{ color: "#4ade80" }} /> : <Copy className="h-3 w-3" />}
                            </button>
                            <a href={link.tracking_url} target="_blank" rel="noreferrer"
                              className="text-xs rounded p-1.5" style={GLASS.btnGhost} title="本URLを開く">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right" style={{ color: "rgba(240,238,255,0.7)" }}>
                          {link.unit_payout != null ? `¥${link.unit_payout.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <select value={link.status}
                            onChange={(e) => handleStatusToggle(link, e.target.value as "active" | "paused" | "dead")}
                            className="rounded-md px-2 py-1 text-xs"
                            style={{ background: stColor.bg, color: stColor.color, border: "1px solid transparent" }}>
                            <option value="active">稼働中</option>
                            <option value="paused">停止中</option>
                            <option value="dead">終了</option>
                          </select>
                        </td>
                        <td className="px-3 py-3 text-right" style={{ color: "#60a5fa" }}>
                          {(link.total_clicks ?? 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-right" style={{ color: "#4ade80" }}>
                          {(link.total_cv ?? 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-right" style={{ color: "#fbbf24" }}>
                          ¥{(link.total_revenue ?? 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleEdit(link)} className="rounded p-1.5"
                              style={GLASS.btnGhost} title="編集">
                              <Edit3 className="h-3 w-3" />
                            </button>
                            <button onClick={() => handleDelete(link.id)} className="rounded p-1.5"
                              style={{ ...GLASS.btnGhost, color: "#fb7185" }} title="削除">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
