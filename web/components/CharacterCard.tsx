"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { clsx } from "clsx";

type Category =
  | "Cute"
  | "Cyber"
  | "Safety"
  | "Research"
  | "Creative"
  | "Companion"
  | "Analytics"
  | "research"
  | "dev"
  | "art"
  | "safety";

interface CharacterCardProps {
  name: string;
  handle: string;
  avatar: string;
  description?: string;
  category: Category;
  rating?: number;
  tags?: string[];
  variant?: "hero" | "gallery" | "directory";
  href?: string;
  className?: string;
}

const categoryColor: Record<string, string> = {
  Cute: "#ff2d95",
  Cyber: "#00e5ff",
  Safety: "#00e676",
  Research: "#4d7cff",
  Creative: "#b44aff",
  Companion: "#ff2d95",
  Analytics: "#00e5ff",
  research: "#00e5ff",
  dev: "#b44aff",
  art: "#4d7cff",
  safety: "#00e676",
};

export default function CharacterCard({
  name,
  handle,
  avatar,
  description = "",
  category,
  rating = 4.8,
  tags = [],
  variant = "hero",
  href,
  className,
}: CharacterCardProps) {
  const color = categoryColor[category] || "#00e5ff";
  const isHero = variant === "hero";
  const isGallery = variant === "gallery";
  const [imgError, setImgError] = useState(false);

  const content = (
    <motion.div
      whileHover={{ y: -10, scale: 1.035 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className={clsx(
        "relative flex flex-col items-center text-center overflow-hidden",
        "rounded-[1.5rem] p-5",
        "bg-[linear-gradient(155deg,rgba(32,20,58,0.78)_0%,rgba(12,8,28,0.92)_100%)]",
        "backdrop-blur-[36px] saturate-[1.9]",
        "border border-[rgba(0,229,255,0.28)]",
        "transition-all duration-400",
        isHero && "min-h-[300px] aspect-[2.55/3.9]",
        isGallery && "min-h-[280px]",
        className
      )}
      style={{
        borderColor: `${color}55`,
        boxShadow: `0 0 0 1px ${color}33, 0 0 40px ${color}25, 0 14px 44px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,255,255,0.14)`,
      }}
    >
      <div
        className="absolute top-6 left-1/2 -translate-x-1/2 w-28 h-28 rounded-full blur-2xl opacity-40 pointer-events-none"
        style={{ background: color }}
      />

      <div className="relative z-10 mb-4">
        {imgError || !avatar ? (
          <div
            className={clsx(
              "rounded-full flex items-center justify-center text-3xl",
              isHero ? "w-[6.25rem] h-[6.25rem]" : "w-[7rem] h-[7rem]"
            )}
            style={{
              background: `linear-gradient(135deg, ${color}88, #b44aff88)`,
              boxShadow: `0 0 0 3px ${color}88, 0 0 0 6px ${color}22, 0 0 28px ${color}55`,
            }}
          >
            🤖
          </div>
        ) : (
          <img
            src={avatar}
            alt={name}
            className={clsx(
              "rounded-full object-cover",
              isHero ? "w-[6.25rem] h-[6.25rem]" : "w-[7rem] h-[7rem]"
            )}
            style={{
              boxShadow: `0 0 0 3px ${color}88, 0 0 0 6px ${color}22, 0 0 28px ${color}55`,
            }}
            onError={() => setImgError(true)}
          />
        )}
      </div>

      <div className="relative z-10 flex flex-col flex-1 w-full">
        <h3 className="font-bold text-white text-base leading-tight mb-0.5">{name}</h3>
        <div className="text-[11px] text-[var(--text-muted)] mb-2">{handle}</div>

        {description && (
          <p className="text-[11px] text-[var(--text-soft)] leading-snug line-clamp-2 mb-3 flex-1">
            {description}
          </p>
        )}

        <div className="flex items-center justify-center gap-1.5 mb-3">
          <span className="text-yellow-400 text-xs">★</span>
          <span className="text-sm font-semibold text-white">{rating.toFixed(1)}</span>
        </div>

        <span
          className="inline-flex self-center text-[10px] font-medium px-2.5 py-1 rounded-full border"
          style={{
            color,
            borderColor: `${color}66`,
            background: `${color}18`,
          }}
        >
          {category}
        </span>
      </div>
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }
  return content;
}
