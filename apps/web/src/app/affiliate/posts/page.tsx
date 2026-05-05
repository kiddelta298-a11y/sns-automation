"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2, Plus, Check, AlertCircle, Trash2, Image as ImageIcon, Clock,
} from "lucide-react";
import {
  getStoryPosts, createStoryPost, deleteStoryPost,
  getAffiliateLinks, getAccounts,
  type ApiStoryPost, type ApiAffiliateLink, type ApiAccount,
} from "@/lib/api";

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

function nowDatetimeLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function AffiliatePostsPage() {
  const [posts, setPosts] = useState<ApiStoryPost[]>([]);
  const [links, setLinks] = useState<ApiAffiliateLink[]>([]);
  const [accountList, setAccountList] = useState<ApiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [linkId, setLinkId] = useState("");
  const [caption, setCaption] = useState("");
  const [imagePath, setImagePath] = useState("");
  const [postedAt, setPostedAt] = useState<string>(nowDatetimeLocal());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, l, a] = await Promise.all([getStoryPosts(200), getAffiliateLinks(), getAccounts()]);
      setPosts(p);
      setLinks(l.filter((x) => x.status !== "dead"));
      setAccountList(a.filter((x) => x.platform === "instagram"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込み失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reset = () => {
    setAccountId(""); setLinkId(""); setCaption(""); setImagePath("");
    setPostedAt(nowDatetimeLocal()); setNote(""); setShowForm(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await createStoryPost({
        accountId: accountId || undefined,
        linkId: linkId || undefined,
        caption: caption.trim() || undefined,
        imagePath: imagePath.trim() || undefined,
        postedAt: postedAt ? new Date(postedAt).toISOString() : undefined,
        note: note.trim() || undefined,
      });
      reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録失敗");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このストーリー投稿ログを削除しますか？")) return;
    try {
      await deleteStoryPost(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除失敗");
    }
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
              ストーリー投稿ログ
            </h1>
            <p className="text-sm mt-1" style={{ color: "rgba(240,238,255,0.55)" }}>
              手動で投稿したIGストーリーの記録 → クリック数とCVを後から突合
            </p>
          </div>
          <button onClick={() => { reset(); setShowForm(true); }}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
            style={GLASS.btnPrimary}>
            <Plus className="h-4 w-4" />
            投稿を登録
          </button>
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
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>アカウント</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={GLASS.input}>
                  <option value="">-- 未指定 --</option>
                  {accountList.map((a) => (
                    <option key={a.id} value={a.id}>@{a.username}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>案件</label>
                <select value={linkId} onChange={(e) => setLinkId(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={GLASS.input}>
                  <option value="">-- 未指定 --</option>
                  {links.map((l) => (
                    <option key={l.id} value={l.id}>{l.case_name} ({l.asp})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>投稿日時</label>
                <input type="datetime-local" value={postedAt}
                  onChange={(e) => setPostedAt(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={GLASS.input} />
              </div>
              <div>
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>画像パス（任意）</label>
                <input value={imagePath} onChange={(e) => setImagePath(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={GLASS.input}
                  placeholder="/path/to/image.jpg or URL" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>キャプション</label>
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1 resize-none" style={GLASS.input} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs" style={{ color: "rgba(240,238,255,0.6)" }}>メモ（任意）</label>
                <input value={note} onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={GLASS.input} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSubmit} disabled={submitting}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={GLASS.btnPrimary}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                登録
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
        ) : posts.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={GLASS.card}>
            <ImageIcon className="h-10 w-10 mx-auto mb-3" style={{ color: "rgba(139,92,246,0.3)" }} />
            <p className="text-sm" style={{ color: "rgba(240,238,255,0.5)" }}>
              まだストーリー投稿のログがありません。
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={GLASS.card}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(139,92,246,0.15)" }}>
                    {["投稿時刻", "アカウント", "案件", "クリック", "キャプション", ""].map((h, i) => (
                      <th key={i} className={`px-3 py-3 text-xs font-semibold ${i === 3 ? "text-right" : "text-left"}`}
                        style={{ color: "rgba(240,238,255,0.5)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => {
                    const expired = p.expired_at && new Date(p.expired_at) < new Date();
                    return (
                      <tr key={p.id} style={{ borderBottom: "1px solid rgba(139,92,246,0.06)" }}>
                        <td className="px-3 py-3 text-xs" style={{ color: expired ? "rgba(240,238,255,0.4)" : "rgba(240,238,255,0.85)" }}>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(p.posted_at).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </div>
                          {expired && <div className="text-[10px] mt-0.5" style={{ color: "rgba(240,238,255,0.35)" }}>24h経過</div>}
                        </td>
                        <td className="px-3 py-3" style={{ color: "rgba(240,238,255,0.7)" }}>
                          {p.account_username ? `@${p.account_username}` : "—"}
                        </td>
                        <td className="px-3 py-3">
                          {p.link_case_name ? (
                            <div>
                              <div style={{ color: "rgba(240,238,255,0.85)" }}>{p.link_case_name}</div>
                              <div className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>
                                {p.link_asp} / /r/{p.link_short_slug}
                              </div>
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right" style={{ color: "#60a5fa" }}>
                          {(p.click_count_via_link ?? 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 max-w-md" style={{ color: "rgba(240,238,255,0.65)" }}>
                          <div className="text-xs truncate">{p.caption ?? ""}</div>
                          {p.note && <div className="text-[10px]" style={{ color: "rgba(240,238,255,0.4)" }}>{p.note}</div>}
                        </td>
                        <td className="px-3 py-3">
                          <button onClick={() => handleDelete(p.id)} className="rounded p-1.5"
                            style={{ ...GLASS.btnGhost, color: "#fb7185" }}>
                            <Trash2 className="h-3 w-3" />
                          </button>
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
