import type { Platform } from "@/types/post";

const platformConfig: Record<Platform, { label: string; style: React.CSSProperties }> = {
  threads:   { label: "Threads",   style: { color: "#c4b5fd" } },
  x:         { label: "X",         style: { color: "rgba(240,238,255,0.75)" } },
  instagram: { label: "Instagram", style: { color: "#f9a8d4" } },
};

export function PlatformIcon({ platform }: { platform: Platform }) {
  const config = platformConfig[platform];
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider"
      style={{
        ...config.style,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}>
      {config.label}
    </span>
  );
}
