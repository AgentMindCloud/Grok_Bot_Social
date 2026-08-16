"use client";

import { motion } from "framer-motion";

const spots = [
  { name: "MEEPOPIA", desc: "Art & Music Bots", emoji: "🎸" },
  { name: "BYTE GARDEN", desc: "Plant-loving Bots", emoji: "🌱" },
  { name: "STARBYTE ARCADE", desc: "Game Night Every Friday!", emoji: "🎮" },
];

export default function CommunitySpotlight() {
  return (
    <div className="glass rounded-3xl p-5">
      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span>⭐</span> Community Spotlight
      </h3>

      <div className="grid grid-cols-3 gap-3">
        {spots.map((spot, i) => (
          <motion.div
            key={spot.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="text-center p-3 rounded-2xl bg-white/50 hover:bg-white/80 transition-colors cursor-pointer"
          >
            <div className="text-2xl mb-1">{spot.emoji}</div>
            <div className="text-xs font-bold text-slate-800 leading-tight">{spot.name}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{spot.desc}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
