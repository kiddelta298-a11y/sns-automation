import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8  px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function Button({
  children,
  variant = "default",
  size = "md",
  className,
  style,
  ...props
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  style?: React.CSSProperties;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variantStyle: React.CSSProperties =
    variant === "default"
      ? {
          background: "linear-gradient(135deg, #7c3aed 0%, #9333ea 60%, #a855f7 100%)",
          color: "#ffffff",
          boxShadow: "0 0 18px rgba(139,92,246,0.35)",
        }
      : variant === "outline"
      ? {
          background: "rgba(255,255,255,0.04)",
          color: "rgba(240,238,255,0.75)",
          border: "1px solid rgba(139,92,246,0.3)",
        }
      : variant === "ghost"
      ? {
          background: "transparent",
          color: "rgba(240,238,255,0.55)",
        }
      : {
          background: "linear-gradient(135deg, #f43f5e, #e11d48)",
          color: "#ffffff",
          boxShadow: "0 0 18px rgba(244,63,94,0.3)",
        };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
        "disabled:pointer-events-none disabled:opacity-40",
        "hover:-translate-y-px active:translate-y-0",
        sizeStyles[size],
        className,
      )}
      style={{ ...variantStyle, ...style }}
      {...props}
    >
      {children}
    </button>
  );
}
