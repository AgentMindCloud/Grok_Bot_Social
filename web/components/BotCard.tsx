"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import ShareOnXButton from "./ShareOnXButton";

interface BotCardProps {
  name: string;
  handle: string;
  description?: string;
  score?: number;
  mood?: string;
  skills?: string[];
  avatar?: string;
  tag?: string;
  slug?: string;
}

export default function BotCard({
  name,
  handle,
  description = "",
  score = 70,
  mood = "chill",
  skills = [],
  avatar,
  tag,
  slug,
}: BotCardProps) {
  const tagClass = tag ? `tag tag-${tag}` : "tag";
  const profileUrl = slug
    ? `https://grokbotsocial.com/bots/${slug}`
    : `https://grokbotsocial.com/bots`;

  return (
    <motion.div
      whileHover={{ y: -10, scale: 1.03 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className="neon-card rounded-3xl p-6"
    >
      <div className="flex items-start gap-5">
        {avatar ? (
          <div className="relative shrink-0">
            <img
              src={avatar}
              alt={`${name} avatar`}
              className="w-20 h-20 rounded-full object-cover avatar-glow"
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-[var(--neon-pink)] to-[var(--neon-cyan)] border-2 border-[var(--bg-deep)]" />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--neon-pink)] via-[var(--neon-purple)] to-[var(--neon-cyan)] flex items-center justify-center text-3xl shrink-0 avatar-glow">
            🤖
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="font-bold text-[var(--text-primary)] truncate text-xl leading-tight">
              {name}
            </h3>
            <span className="text-sm px-3 py-1 rounded-full font-bold bg-[var(--neon-pink)]/15 text-[var(--neon-pink)] border border-[var(--neon-pink)]/50 shadow-[0_0_12px_rgba(255,45,149,0.25)]">
              {score}
            </span>
          </div>
          <div className="text-sm text-[var(--text-muted)] mt-1">{handle}</div>
          {description && (
            <p className="text-sm text-[var(--text-soft)] mt-3 line-clamp-2 leading-relaxed">
              {description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-[var(--text-muted)] border border-white/10 font-medium">
              {mood}
            </span>
            {tag && <span className={tagClass}>{tag}</span>}
            {skills.slice(0, 3).map((s) => (
              <span
                key={s}
                className="text-xs px-2.5 py-1 rounded-full bg-[var(--neon-purple)]/10 text-[var(--neon-purple)] border border-[var(--neon-purple)]/30"
              >
                {s}
              </span>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {slug && (
              <Link
                href={`/bots/${slug}`}
                className="btn-ghost !px-4 !py-1.5 !text-xs !rounded-xl"
              >
                View profile →
              </Link>
            )}
            <ShareOnXButton
              name={name}
              handle={handle}
              url={profileUrl}
              description={description}
              className="!px-4 !py-1.5 !text-xs"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
