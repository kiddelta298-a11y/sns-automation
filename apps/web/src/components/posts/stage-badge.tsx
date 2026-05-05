import type { LiveStage } from "@/lib/api";

const config: Record<
  LiveStage,
  { label: string; bg: string; color: string; border: string }
> = {
  login: {
    label: "ログイン中",
    bg: "rgba(168,85,247,0.18)",
    color: "#d8b4fe",
    border: "1px solid rgba(168,85,247,0.3)",
  },
  compose: {
    label: "投稿準備中",
    bg: "rgba(234,179,8,0.18)",
    color: "#fde047",
    border: "1px solid rgba(234,179,8,0.3)",
  },
  publish: {
    label: "公開中",
    bg: "rgba(59,130,246,0.18)",
    color: "#93c5fd",
    border: "1px solid rgba(59,130,246,0.3)",
  },
  done: {
    label: "完了",
    bg: "rgba(34,197,94,0.15)",
    color: "#86efac",
    border: "1px solid rgba(34,197,94,0.25)",
  },
};

export function StageBadge({ stage }: { stage: LiveStage }) {
  const c = config[stage];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: c.bg, color: c.color, border: c.border }}
    >
      {c.label}
    </span>
  );
}
