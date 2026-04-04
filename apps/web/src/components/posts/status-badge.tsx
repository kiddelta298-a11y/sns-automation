import { Badge } from "@/components/ui/badge";
import type { PostStatus } from "@/types/post";

const statusConfig: Record<
  PostStatus,
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "default" }
> = {
  posted: { label: "投稿済み", variant: "success" },
  scheduled: { label: "予約済み", variant: "default" },
  posting: { label: "投稿中", variant: "warning" },
  draft: { label: "下書き", variant: "secondary" },
  failed: { label: "失敗", variant: "destructive" },
};

export function StatusBadge({ status }: { status: PostStatus }) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
