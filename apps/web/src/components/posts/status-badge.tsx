import { Badge } from "@/components/ui/badge";
import type { PostStatus } from "@/types/post";

type Variant = "success" | "warning" | "destructive" | "secondary" | "default";

const statusConfig: Record<PostStatus | "processing", { label: string; variant: Variant }> = {
  posted: { label: "投稿済み", variant: "success" },
  scheduled: { label: "予約済み", variant: "default" },
  posting: { label: "投稿中", variant: "warning" },
  processing: { label: "実行中", variant: "warning" },
  draft: { label: "下書き", variant: "secondary" },
  failed: { label: "失敗", variant: "destructive" },
};

export function StatusBadge({ status }: { status: PostStatus | string }) {
  const config = statusConfig[status as keyof typeof statusConfig] ?? {
    label: status,
    variant: "secondary" as const,
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
