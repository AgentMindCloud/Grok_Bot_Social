"use client";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { ExperienceButton, ExperienceLink } from "./experience/ExperienceButton";
export type LiquidVariant = "cyan" | "pink" | "amber" | "quiet" | "danger";
type StyleProps = {
  variant?: LiquidVariant;
  size?: "small" | "default" | "hero";
  loading?: boolean;
};
/** Product controls share the tested native, motion-aware experience controls. */
export default function LiquidButton({
  variant = "cyan",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & StyleProps) {
  return (
    <ExperienceButton
      {...props}
      variant={variant === "danger" ? "pink" : variant}
      className={`product-control ${variant === "danger" ? "product-control-danger" : ""} ${className}`}
    />
  );
}
export function LiquidLink({
  variant = "cyan",
  className = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & Omit<StyleProps, "loading">) {
  return (
    <ExperienceLink
      {...props}
      variant={variant === "danger" ? "pink" : variant}
      className={`product-control ${variant === "danger" ? "product-control-danger" : ""} ${className}`}
    />
  );
}
