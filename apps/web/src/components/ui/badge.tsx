import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "secondary";

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default:     { background: "rgba(139,92,246,0.18)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.25)" },
  success:     { background: "rgba(34,197,94,0.15)",  color: "#86efac", border: "1px solid rgba(34,197,94,0.2)"  },
  warning:     { background: "rgba(234,179,8,0.15)",  color: "#fde047", border: "1px solid rgba(234,179,8,0.2)"  },
  destructive: { background: "rgba(244,63,94,0.15)",  color: "#fda4af", border: "1px solid rgba(244,63,94,0.2)"  },
  secondary:   { background: "rgba(255,255,255,0.07)", color: "rgba(240,238,255,0.55)", border: "1px solid rgba(255,255,255,0.1)" },
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
      style={variantStyles[variant]}
    >
      {children}
    </span>
  );
}
