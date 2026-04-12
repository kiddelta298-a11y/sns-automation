"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getAccountGroups,
  createAccountGroup,
  deleteAccountGroup,
  addGroupMember,
  removeGroupMember,
  bulkPost,
  getAccounts,
  getGroupStats,
  type ApiAccountGroup,
  type ApiAccount,
} from "@/lib/api";
import {
  Users, Plus, Trash2, Send, Loader2, X, ChevronDown, ChevronUp,
  Layers, UserPlus, BarChart2, Check, AlertTriangle,
} from "lucide-react";

const GLASS = {
  bg: "rgba(15,12,30,0.6)",
  border: "1px solid rgba(139,92,246,0.15)",
};

export default function AccountGroupsPage() {
  const [groups, setGroups] = useState<ApiAccountGroup[]>([]);
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [bulkContent, setBulkContent] = useState<Record<string, string>>({});
  const [bulkSchedule, setBulkSchedule] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState<Record<string, boolean>>({});
  const [postResult, setPostResult] = useState<Record<string, { success: boolean; message: string }>>({});
  const [addingMember, setAddingMember] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, { username: string; platform: string; post_count: number; posted_count: number; followers: number }[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, a] = await Promise.all([getAccountGroups(), getAccounts()]);
      setGroups(g);
      setAccounts(a);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createAccountGroup({ name: newName.trim(), description: newDesc.trim() || undefined });
      setNewName("");
      setNewDesc("");
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAccountGroup(id);
    await load();
  };

  const handleAddMember = async (groupId: string, accountId: string) => {
    await addGroupMember(groupId, accountId);
    setAddingMember(null);
    await load();
  };

  const handleRemoveMember = async (groupId: string, memberId: string) => {
    await removeGroupMember(groupId, memberId);
    await load();
  };

  const handleBulkPost = async (groupId: string) => {
    const content = bulkContent[groupId]?.trim();
    if (!content) return;
    setPosting((p) => ({ ...p, [groupId]: true }));
    try {
      const result = await bulkPost(groupId, {
        contentText: content,
        scheduledAt: bulkSchedule[groupId] || undefined,
      });
      setPostResult((r) => ({
        ...r,
        [groupId]: { success: true, message: `${result.created}件のアカウントに投稿を作成しました` },
      }));
      setBulkContent((c) => ({ ...c, [groupId]: "" }));
    } catch (e: unknown) {
      setPostResult((r) => ({
        ...r,
        [groupId]: { success: false, message: e instanceof Error ? e.message : "エラーが発生しました" },
      }));
    } finally {
      setPosting((p) => ({ ...p, [groupId]: false }));
    }
  };

  const handleLoadStats = async (groupId: string) => {
    try {
      const res = await getGroupStats(groupId);
      setStats((s) => ({ ...s, [groupId]: res.stats as typeof stats[string] }));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleExpand = (id: string) => {
    const next = expandedGroup === id ? null : id;
    setExpandedGroup(next);
    if (next && !stats[next]) handleLoadStats(next);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "#e2dff6" }}>
          <Layers className="h-5 w-5" style={{ color: "#a78bfa" }} />
          マルチアカウント管理
        </h1>
        <p className="text-xs mt-1" style={{ color: "rgba(240,238,255,0.4)" }}>
          複数アカウントをグループ化し、一括投稿・管理
        </p>
      </div>

      {/* Create Group */}
      <div className="rounded-xl p-4" style={{ background: GLASS.bg, border: GLASS.border }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "#c4b5fd" }}>新規グループ作成</h3>
        <div className="flex gap-2 flex-wrap">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="グループ名"
            className="rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
            style={{ background: "rgba(15,12,30,0.8)", color: "#e2dff6", border: "1px solid rgba(139,92,246,0.2)" }}
          />
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="説明（任意）"
            className="rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
            style={{ background: "rgba(15,12,30,0.8)", color: "#e2dff6", border: "1px solid rgba(139,92,246,0.2)" }}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.3)" }}
          >
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            作成
          </button>
        </div>
      </div>

      {/* Groups List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#a78bfa" }} />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: GLASS.bg, border: GLASS.border }}>
          <Layers className="h-12 w-12 mx-auto mb-3" style={{ color: "rgba(240,238,255,0.12)" }} />
          <p className="text-sm" style={{ color: "rgba(240,238,255,0.4)" }}>
            グループを作成して、複数アカウントを一元管理しましょう
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isExpanded = expandedGroup === group.id;
            const groupStats = stats[group.id];
            const memberAccountIds = new Set(group.members.map((m) => m.accountId));
            const availableAccounts = accounts.filter((a) => !memberAccountIds.has(a.id));

            return (
              <div key={group.id} className="rounded-xl overflow-hidden" style={{ background: GLASS.bg, border: GLASS.border }}>
                {/* Group Header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer transition-colors hover:bg-white/[0.02]"
                  onClick={() => toggleExpand(group.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg"
                      style={{ background: "rgba(139,92,246,0.15)" }}>
                      <Users className="h-4 w-4" style={{ color: "#a78bfa" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#e2dff6" }}>{group.name}</p>
                      <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.35)" }}>
                        {group.memberCount}アカウント
                        {group.description && ` / ${group.description}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(group.id); }}
                      className="rounded-lg p-1.5 transition-colors"
                      style={{ color: "rgba(240,238,255,0.25)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(240,238,255,0.25)"; }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {isExpanded ? <ChevronUp className="h-4 w-4" style={{ color: "rgba(240,238,255,0.3)" }} />
                      : <ChevronDown className="h-4 w-4" style={{ color: "rgba(240,238,255,0.3)" }} />}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4" style={{ borderTop: "1px solid rgba(139,92,246,0.08)" }}>
                    {/* Members */}
                    <div className="pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium" style={{ color: "#a78bfa" }}>メンバーアカウント</p>
                        <button
                          onClick={() => setAddingMember(addingMember === group.id ? null : group.id)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px]"
                          style={{ background: "rgba(139,92,246,0.1)", color: "#c4b5fd" }}
                        >
                          <UserPlus className="h-3 w-3" />追加
                        </button>
                      </div>

                      {addingMember === group.id && availableAccounts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3 p-2 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
                          {availableAccounts.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => handleAddMember(group.id, a.id)}
                              className="rounded-lg px-2 py-1 text-[10px] transition-colors"
                              style={{ background: "rgba(139,92,246,0.08)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.15)" }}
                            >
                              @{a.username} ({a.platform})
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {group.members.map((m) => (
                          <div key={m.id} className="flex items-center justify-between rounded-lg p-2"
                            style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.08)" }}>
                            <div>
                              <span className="text-xs font-medium" style={{ color: "#c4b5fd" }}>@{m.account.username}</span>
                              <span className="text-[10px] ml-2" style={{ color: "rgba(240,238,255,0.3)" }}>{m.account.platform}</span>
                              {m.account.status !== "active" && (
                                <span className="text-[10px] ml-1 px-1 rounded" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                                  {m.account.status}
                                </span>
                              )}
                            </div>
                            <button onClick={() => handleRemoveMember(group.id, m.id)}
                              className="p-1" style={{ color: "rgba(240,238,255,0.2)" }}>
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Stats */}
                    {groupStats && groupStats.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-2" style={{ color: "#a78bfa" }}>アカウント統計</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {groupStats.map((s) => (
                            <div key={s.username} className="rounded-lg p-2 flex items-center justify-between"
                              style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.08)" }}>
                              <div>
                                <span className="text-xs font-medium" style={{ color: "#c4b5fd" }}>@{s.username}</span>
                                <div className="flex gap-3 text-[10px] mt-0.5" style={{ color: "rgba(240,238,255,0.4)" }}>
                                  <span>{s.post_count}投稿</span>
                                  <span>{s.posted_count}公開済</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-medium" style={{ color: "#a78bfa" }}>{s.followers.toLocaleString()}</p>
                                <p className="text-[10px]" style={{ color: "rgba(240,238,255,0.3)" }}>フォロワー</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bulk Post */}
                    <div>
                      <p className="text-xs font-medium mb-2" style={{ color: "#fbbf24" }}>
                        <Send className="inline h-3 w-3 mr-1" />一括投稿
                      </p>
                      <textarea
                        value={bulkContent[group.id] ?? ""}
                        onChange={(e) => setBulkContent((c) => ({ ...c, [group.id]: e.target.value }))}
                        placeholder="投稿内容を入力..."
                        rows={4}
                        className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                        style={{ background: "rgba(15,12,30,0.8)", color: "#e2dff6", border: "1px solid rgba(139,92,246,0.2)" }}
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="datetime-local"
                          value={bulkSchedule[group.id] ?? ""}
                          onChange={(e) => setBulkSchedule((s) => ({ ...s, [group.id]: e.target.value }))}
                          className="rounded-lg px-3 py-1.5 text-xs"
                          style={{ background: "rgba(15,12,30,0.8)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.2)" }}
                        />
                        <span className="text-[10px]" style={{ color: "rgba(240,238,255,0.3)" }}>
                          予約（空欄=下書き）
                        </span>
                        <button
                          onClick={() => handleBulkPost(group.id)}
                          disabled={posting[group.id] || !bulkContent[group.id]?.trim()}
                          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium ml-auto transition-colors"
                          style={{
                            background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(168,85,247,0.2))",
                            color: "#c4b5fd",
                            border: "1px solid rgba(139,92,246,0.3)",
                          }}
                        >
                          {posting[group.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          一括投稿
                        </button>
                      </div>

                      {postResult[group.id] && (
                        <div className="mt-2 rounded-lg px-3 py-2 text-xs flex items-center gap-2"
                          style={{
                            background: postResult[group.id].success ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                            color: postResult[group.id].success ? "#4ade80" : "#f87171",
                            border: postResult[group.id].success ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(239,68,68,0.2)",
                          }}>
                          {postResult[group.id].success ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {postResult[group.id].message}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
