import type { ExecStatus } from "@/lib/api";

const config: Record<
  ExecStatus,
  { label: string; bg: string; color: string; border: string; pulse: boolean }
> = {
  pending: {
    label: "待機中",
    bg: "rgba(148,163,184,0.15)",
    color: "#cbd5e1",
    border: "1px solid rgba(148,163,184,0.25)",
    pulse: false,
  },
  executing: {
    label: "実行中",
    bg: "rgba(59,130,246,0.18)",
    color: "#93c5fd",
    border: "1px solid rgba(59,130,246,0.35)",
    pulse: true,
  },
  completed: {
    label: "完了",
    bg: "rgba(34,197,94,0.15)",
    color: "#86efac",
    border: "1px solid rgba(34,197,94,0.25)",
    pulse: false,
  },
  failed: {
    label: "失敗",
    bg: "rgba(244,63,94,0.15)",
    color: "#fda4af",
    border: "1px solid rgba(244,63,94,0.25)",
    pulse: false,
  },
};

export function ExecStatusBadge({ status }: { status: ExecStatus }) {
  const c = config[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: c.bg, color: c.color, border: c.border }}
    >
      <span
        aria-hidden="true"
        className={c.pulse ? "animate-pulse" : ""}
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: c.color,
          boxShadow: c.pulse ? `0 0 8px ${c.color}` : "none",
        }}
      />
      {c.label}
    </span>
  );
}
