"use client";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  PointerEvent,
} from "react";
export type LiquidVariant = "cyan" | "pink" | "amber" | "quiet" | "danger";
type StyleProps = {
  variant?: LiquidVariant;
  size?: "small" | "default" | "hero";
  loading?: boolean;
};
function reflection(event: PointerEvent<HTMLElement>) {
  if (
    event.pointerType !== "mouse" ||
    document.documentElement.dataset.motion !== "on"
  )
    return;
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty(
    "--light-x",
    `${((event.clientX - box.left) / box.width) * 100}%`,
  );
}
export default function LiquidButton({
  variant = "cyan",
  size = "default",
  loading = false,
  className = "",
  children,
  onPointerMove,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & StyleProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
      className={`liquid-control liquid-${variant} liquid-${size} ${className}`}
      onPointerMove={(event) => {
        reflection(event);
        onPointerMove?.(event);
      }}
    >
      <span className="liquid-label">{children}</span>
    </button>
  );
}
export function LiquidLink({
  variant = "cyan",
  size = "default",
  className = "",
  children,
  onPointerMove,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & Omit<StyleProps, "loading">) {
  return (
    <a
      {...props}
      className={`liquid-control liquid-${variant} liquid-${size} ${className}`}
      onPointerMove={(event) => {
        reflection(event);
        onPointerMove?.(event);
      }}
    >
      <span className="liquid-label">{children}</span>
    </a>
  );
}
