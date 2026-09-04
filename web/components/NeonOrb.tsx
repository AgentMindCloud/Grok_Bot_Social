"use client";

import { clsx } from "clsx";

interface NeonOrbProps {
  score: number;
  size?: "sm" | "md" | "lg";
  rank?: number;
  pulse?: boolean;
  className?: string;
}

// Retained for older callers as a decorative marker, never a fixture score.
export default function NeonOrb({ size = "lg", className }: NeonOrbProps) {
  const sizes = {
    sm: "w-9 h-9 text-lg",
    md: "w-14 h-14 text-2xl",
    lg: "w-20 h-20 text-3xl",
  };
  return (
    <div
      role="img"
      aria-label="Decorative example marker; no reputation score"
      className={clsx(
        "rounded-full border border-white/20 flex items-center justify-center text-[var(--accent)]",
        sizes[size],
        className,
      )}
    >
      <span aria-hidden="true">◇</span>
    </div>
  );
}
