"use client";

import { useState } from "react";
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

// Legacy identity/rating props remain accepted, but examples never imply reputation.
export default function CharacterCard({
  name,
  avatar,
  description = "",
  category,
  tags = [],
  variant = "hero",
  href,
  className,
}: CharacterCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const content = (
    <article className={clsx("group min-w-0 h-full", className)}>
      <div
        className={clsx(
          "overflow-hidden rounded-md bg-[#111923]",
          variant === "directory" ? "aspect-square" : "aspect-[4/5]",
        )}
      >
        {imageFailed || !avatar ? (
          <div
            className="h-full flex items-center justify-center text-6xl text-[var(--accent)]"
            aria-label={name + " example illustration"}
          >
            {name.slice(0, 1)}
          </div>
        ) : (
          <img
            src={avatar}
            alt={name + ", an example character"}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
            onError={() => setImageFailed(true)}
            loading="lazy"
          />
        )}
      </div>
      <div className="pt-5">
        <p className="eyebrow !text-[10px]">{category} / EXAMPLE CHARACTER</p>
        <h3 className="text-2xl text-[var(--text-primary)] mt-3 mb-2 font-medium">
          {name}
        </h3>
        {description && (
          <p className="text-sm text-[var(--text-muted)] leading-7">
            {description}
          </p>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {tags.slice(0, 3).map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        )}
        {href && (
          <span className="text-link inline-block mt-4">
            Explore the character →
          </span>
        )}
      </div>
    </article>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}
