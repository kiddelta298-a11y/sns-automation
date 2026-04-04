"use client";

import { useState, useEffect } from "react";
import { getSettings, saveSettings } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Settings, Key, Database, Bell, Bot, Monitor,
  Save, CheckCircle2, Loader2, Eye, EyeOff, AlertCircle,
} from "lucide-react";

interface SettingField {
  key: string;
  label: string;
  description: string;
  type: "text" | "password" | "number" | "toggle" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
  min?: number; max?: number;
}

const SECTIONS: { title: string; icon: React.ComponentType<{ className?: string }>; fields: SettingField[] }[] = [
  {
    title: "AI設定",
    icon: Bot,
    fields: [
      {
        key: "anthropic_api_key",
        label: "Anthropic APIキー",
        description: "Claude APIの認証キー。トレンド分析・投稿生成に必要です。",
        type: "password",
        placeholder: "sk-ant-...",
      },
    ],
  },
  {
    title: "収集設定",
    icon: Database,
    fields: [
      {
        key: "default_collection_target",
        label: "デフォルト収集目標件数",
        description: "1回の収集で取得する投稿数の目標。多いほど精度が上がりますが時間がかかります。",
        type: "number",
        placeholder: "500",
        min: 100, max: 2000,
      },
      {
        key: "auto_analyze_after_collect",
        label: "収集後に自動でAI分析",
        description: "収集完了後、自動的にClaudeによる勝ちパターン分析を実行します。",
        type: "toggle",
      },
    ],
  },
  {
    title: "投稿設定",
    icon: Monitor,
    fields: [
      {
        key: "threads_headless",
        label: "ヘッドレスモードで実行",
        description: "投稿時にブラウザウィンドウを表示しない（本番環境では有効を推奨）。",
        type: "toggle",
      },
      {
        key: "default_account_id",
        label: "デフォルト投稿アカウントID",
        description: "投稿生成後の即時投稿に使用するアカウントID。アカウント一覧から確認できます。",
        type: "text",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      },
    ],
  },
  {
    title: "通知設定",
    icon: Bell,
    fields: [
      {
        key: "ntfy_url",
        label: "ntfy サーバーURL",
        description: "収集完了・投稿完了をスマホに通知するntfyのサーバーURL。",
        type: "text",
        placeholder: "https://ntfy.sh",
      },
      {
        key: "ntfy_topic",
        label: "ntfy トピック",
        description: "通知を受け取るトピック名。",
        type: "text",
        placeholder: "sns-automation",
      },
    ],
  },
];

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then(s => { setValues(s); setOriginal(s); })
      .catch(() => setError("設定の読み込みに失敗しました。APIサーバーが起動しているか確認してください。"))
      .finally(() => setLoading(false));
  }, []);

  const isDirty = JSON.stringify(values) !== JSON.stringify(original);

  const handleChange = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await saveSettings(values);
      setOriginal(updated);
      setValues(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-8">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" /> 設定
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">変更は保存後すぐに反映されます</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className={cn(
            "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all",
            saved
              ? "bg-green-500 text-white"
              : isDirty
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" />
           : saved  ? <CheckCircle2 className="h-4 w-4" />
                    : <Save className="h-4 w-4" />}
          {saving ? "保存中..." : saved ? "保存しました" : "変更を保存"}
        </button>
      </div>

      {/* エラー */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* 未保存変更バナー */}
      {isDirty && !saving && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center justify-between">
          <span>未保存の変更があります</span>
          <button onClick={handleSave} className="font-medium underline hover:no-underline">今すぐ保存</button>
        </div>
      )}

      {/* セクション */}
      {SECTIONS.map(section => (
        <section key={section.title}>
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
            <section.icon className="h-5 w-5 text-primary" />
            {section.title}
          </h2>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {section.fields.map(field => (
              <div key={field.key} className="px-5 py-4">
                <div className={cn(
                  "flex gap-4",
                  field.type === "toggle" ? "items-center justify-between" : "flex-col",
                )}>
                  <div>
                    <label className="block text-sm font-medium text-foreground">
                      {field.label}
                    </label>
                    <p className="mt-0.5 text-xs text-muted-foreground">{field.description}</p>
                  </div>

                  {field.type === "toggle" ? (
                    <button
                      onClick={() => handleChange(field.key, values[field.key] === "true" ? "false" : "true")}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0",
                        values[field.key] === "true" ? "bg-primary" : "bg-muted",
                      )}
                    >
                      <span className={cn(
                        "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                        values[field.key] === "true" ? "translate-x-6" : "translate-x-1",
                      )} />
                    </button>

                  ) : field.type === "password" ? (
                    <div className="relative mt-1">
                      <input
                        type={showPasswords[field.key] ? "text" : "password"}
                        value={values[field.key] ?? ""}
                        onChange={e => handleChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords(p => ({ ...p, [field.key]: !p[field.key] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPasswords[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                  ) : field.type === "number" ? (
                    <input
                      type="number"
                      value={values[field.key] ?? ""}
                      min={field.min}
                      max={field.max}
                      onChange={e => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="mt-1 w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />

                  ) : (
                    <input
                      type="text"
                      value={values[field.key] ?? ""}
                      onChange={e => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* 下部保存ボタン */}
      <div className="flex justify-end pt-2 pb-8">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className={cn(
            "flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all",
            saved
              ? "bg-green-500 text-white"
              : isDirty
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" />
           : saved  ? <CheckCircle2 className="h-4 w-4" />
                    : <Save className="h-4 w-4" />}
          {saving ? "保存中..." : saved ? "保存しました！" : "変更を保存"}
        </button>
      </div>
    </div>
  );
}
