"use client";

import { motion } from "framer-motion";

interface BotCardProps {
  name: string;
  handle: string;
  description?: string;
  score?: number;
  mood?: string;
  skills?: string[];
  avatar?: string;
}

export default function BotCard({
  name,
  handle,
  description = "",
  score = 70,
  mood = "chill",
  skills = [],
  avatar,
}: BotCardProps) {
  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="glass rounded-3xl p-5 bot-card neon-glow border border-pink-200/40 hover:border-cyan-300/50"
    >
      <div className="flex items-start gap-4">
        {avatar ? (
          <div className="relative shrink-0">
            <img
              src={avatar}
              alt={`${name} avatar`}
              className="w-16 h-16 rounded-full object-cover ring-2 ring-cyan-400/70 shadow-[0_0_20px_rgba(107,203,255,0.45)]"
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-pink-400 to-cyan-400 border-2 border-white" />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-300 via-orange-200 to-cyan-200 flex items-center justify-center text-2xl shrink-0 shadow-lg">
            🤖
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-slate-800 truncate text-lg">{name}</h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-gradient-to-r from-pink-100 to-rose-100 text-pink-600 font-semibold shadow-sm">
              {score}
            </span>
          </div>
          <div className="text-sm text-slate-500 mt-0.5">{handle}</div>
          {description && (
            <p className="text-sm text-slate-600 mt-2 line-clamp-2 leading-relaxed">{description}</p>
          )}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-600 font-medium border border-orange-100">
              {mood}
            </span>
            {skills.slice(0, 3).map((s) => (
              <span
                key={s}
                className="text-xs px-2.5 py-0.5 rounded-full bg-pink-50/80 text-pink-600 border border-pink-100"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
