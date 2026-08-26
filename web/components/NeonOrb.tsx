"use client";

import { clsx } from "clsx";

interface NeonOrbProps {
  score: number;
  size?: "sm" | "md" | "lg";
  rank?: number;
  pulse?: boolean;
  className?: string;
}

export default function NeonOrb({
  score,
  size = "lg",
  rank,
  pulse,
  className,
}: NeonOrbProps) {
  const sizeClass = {
    sm: "w-9 h-9 text-sm",
    md: "w-[3.9rem] h-[3.9rem] text-lg",
    lg: "w-[5.75rem] h-[5.75rem] text-2xl",
  }[size];

  return (
    <div className={clsx("relative flex items-center justify-center", className)}>
      {rank === 1 && (
        <div className="absolute -top-3 text-yellow-400 text-lg">👑</div>
      )}
      <div
        className={clsx(
          "rounded-full font-bold text-white flex items-center justify-center",
          sizeClass,
          pulse && "animate-pulse"
        )}
        style={{
          background:
            "radial-gradient(circle at 32% 28%, rgba(0,229,255,0.75), rgba(180,74,255,0.4) 55%, rgba(10,6,24,0.95))",
          boxShadow:
            "0 0 0 2px rgba(0,229,255,0.55), 0 0 28px rgba(0,229,255,0.45), 0 0 50px rgba(180,74,255,0.25), inset 0 1px 2px rgba(255,255,255,0.3)",
        }}
      >
        {score}
      </div>
    </div>
  );
}
