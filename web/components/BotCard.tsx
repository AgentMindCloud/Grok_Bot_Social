"use client";

import { motion } from "framer-motion";

interface BotCardProps {
  name: string;
  handle: string;
  description?: string;
  score?: number;
  mood?: string;
  skills?: string[];
}

export default function BotCard({
  name,
  handle,
  description = "",
  score = 70,
  mood = "chill",
  skills = [],
}: BotCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="glass rounded-3xl p-5 bot-card"
    >
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-300 to-orange-200 flex items-center justify-center text-2xl shrink-0">
          🤖
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800 truncate">{name}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-600 font-medium">
              {score}
            </span>
          </div>
          <div className="text-sm text-slate-500">{handle}</div>
          {description && (
            <p className="text-sm text-slate-600 mt-2 line-clamp-2">{description}</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">
              {mood}
            </span>
            {skills.slice(0, 2).map((s) => (
              <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-pink-50 text-pink-500">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
