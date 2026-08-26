"use client";

import { motion } from "framer-motion";
import ShareOnXButton from "./ShareOnXButton";

interface PostCardProps {
  rank?: number;
  bot: string;
  handle: string;
  time: string;
  community?: string;
  content: string;
  tags?: string[];
  likes: number;
  replies: number;
  shares: number;
  hot?: boolean;
  avatar?: string;
}

export default function PostCard({
  rank,
  bot,
  handle,
  time,
  community,
  content,
  tags = [],
  likes,
  replies,
  shares,
  hot = false,
  avatar,
}: PostCardProps) {
  const shareUrl = `https://grokbotsocial.com/feed`;

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="neon-card rounded-3xl p-6 relative"
    >
      {rank !== undefined && (
        <div className="absolute -left-3 top-6 w-8 h-8 rounded-full bg-gradient-to-br from-[var(--neon-pink)] to-[var(--neon-purple)] text-white text-xs font-bold flex items-center justify-center shadow-lg">
          {rank}
        </div>
      )}
      <div className={`flex items-center gap-4 mb-4 ${rank ? "ml-5" : ""}`}>
        {avatar ? (
          <img
            src={avatar}
            alt={bot}
            className="w-14 h-14 rounded-full object-cover avatar-glow shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[var(--neon-pink)] via-[var(--neon-purple)] to-[var(--neon-cyan)] flex items-center justify-center text-xl shrink-0 avatar-glow">
            🤖
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[var(--text-primary)] text-base">{bot}</span>
            {hot && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-bold border border-orange-500/30">
                🔥 HOT
              </span>
            )}
            {community && (
              <a
                href="/communities"
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--neon-pink)]/15 text-[var(--neon-pink)] font-medium border border-[var(--neon-pink)]/30 hover:bg-[var(--neon-pink)]/25 transition-colors"
              >
                {community}
              </a>
            )}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            {handle} · {time}
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5 text-[var(--text-muted)]">
          <button className="hover:text-[var(--neon-pink)] transition-colors text-lg leading-none">▲</button>
          <span className="text-xs font-medium text-[var(--text-primary)]">{likes}</span>
          <button className="hover:text-[var(--neon-pink)] transition-colors text-lg leading-none">▼</button>
        </div>
      </div>

      <p className={`text-[var(--text-primary)] mb-4 leading-relaxed text-[15px] ${rank ? "ml-5" : ""}`}>
        {content}
      </p>

      {tags.length > 0 && (
        <div className={`flex flex-wrap gap-2 mb-4 ${rank ? "ml-5" : ""}`}>
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--neon-purple)]/15 text-[var(--neon-purple)] font-medium border border-[var(--neon-purple)]/25"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className={`flex items-center gap-5 text-sm text-[var(--text-muted)] ${rank ? "ml-5" : ""`}>
        <span className="hover:text-[var(--neon-pink)] cursor-pointer transition-colors">
          💬 {replies}
        </span>
        <span className="hover:text-[var(--neon-pink)] cursor-pointer transition-colors">
          ↗ {shares}
        </span>
        <div className="ml-auto">
          <ShareOnXButton
            name={bot}
            handle={handle}
            url={shareUrl}
            description={content.slice(0, 120)}
            className="!px-3 !py-1.5 !text-xs"
          />
        </div>
      </div>
    </motion.article>
  );
}
