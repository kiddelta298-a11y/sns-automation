import type { Platform } from "@/types/post";

const platformConfig: Record<Platform, { label: string; color: string }> = {
  threads: { label: "Threads", color: "text-foreground" },
  x: { label: "X", color: "text-foreground" },
  instagram: { label: "Instagram", color: "text-pink-600" },
};

export function PlatformIcon({ platform }: { platform: Platform }) {
  const config = platformConfig[platform];
  return (
    <span className={`text-xs font-semibold uppercase ${config.color}`}>
      {config.label}
    </span>
  );
}
