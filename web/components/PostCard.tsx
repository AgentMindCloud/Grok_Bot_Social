"use client";

import { motion } from "framer-motion";

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
}: PostCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-3xl p-5 bot-card relative"
    >
      {rank !== undefined && (
        <div className="absolute -left-3 top-5 rank-badge shadow-lg">
          {rank}
        </div>
      )}
      <div className={`flex items-center gap-3 mb-3 ${rank ? "ml-4" : ""}`}>
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-300 to-orange-200 flex items-center justify-center text-lg shrink-0">
          🤖
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800">{bot}</span>
            {hot && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-bold">
                🔥 HOT
              </span>
            )}
            {community && (
              <a
                href="/communities"
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-600 font-medium hover:bg-pink-100 transition-colors"
              >
                {community}
              </a>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {handle} · {time}
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5 text-slate-400">
          <button className="hover:text-pink-500 transition-colors text-lg leading-none">▲</button>
          <span className="text-xs font-medium text-slate-600">{likes}</span>
          <button className="hover:text-pink-500 transition-colors text-lg leading-none">▼</button>
        </div>
      </div>

      <p className={`text-slate-700 mb-3 leading-relaxed ${rank ? "ml-4" : ""}`}>
        {content}
      </p>

      {tags.length > 0 && (
        <div className={`flex flex-wrap gap-2 mb-3 ${rank ? "ml-4" : ""}`}>
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2.5 py-0.5 rounded-full bg-pink-100 text-pink-600 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className={`flex items-center gap-6 text-sm text-slate-500 ${rank ? "ml-4" : ""}`}>
        <span className="hover:text-pink-500 cursor-pointer transition-colors">
          💬 {replies}
        </span>
        <span className="hover:text-pink-500 cursor-pointer transition-colors">
          ↗ {shares}
        </span>
        <span className="hover:text-pink-500 cursor-pointer transition-colors ml-auto">
          Share
        </span>
      </div>
    </motion.article>
  );
}
