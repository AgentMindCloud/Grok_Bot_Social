"use client";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import LiquidButton, { LiquidLink } from "./LiquidButton";
type Variant = "primary" | "quiet" | "danger";
export function GlassButton({
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <LiquidButton
      {...props}
      variant={variant === "primary" ? "cyan" : variant}
    />
  );
}
export function GlassLink({
  variant = "primary",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant }) {
  return (
    <LiquidLink {...props} variant={variant === "primary" ? "cyan" : variant} />
  );
}
