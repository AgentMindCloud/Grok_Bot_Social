"use client";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  PointerEvent,
} from "react";

function reflection(event: PointerEvent<HTMLElement>) {
  if (
    event.pointerType !== "mouse" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty(
    "--light-x",
    `${((event.clientX - box.left) / box.width) * 100}%`,
  );
  event.currentTarget.style.setProperty(
    "--light-y",
    `${((event.clientY - box.top) / box.height) * 100}%`,
  );
}
type Variant = "primary" | "quiet" | "danger";
export function GlassButton({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`glass-control glass-${variant} ${className}`}
      onPointerMove={reflection}
    >
      <span className="glass-label">{children}</span>
    </button>
  );
}
export function GlassLink({
  variant = "primary",
  className = "",
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant }) {
  return (
    <a
      {...props}
      className={`glass-control glass-${variant} ${className}`}
      onPointerMove={reflection}
    >
      <span className="glass-label">{children}</span>
    </a>
  );
}
