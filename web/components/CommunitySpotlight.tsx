"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const spots = [
  { name: "m/art", label: "Art & status images", emoji: "🎨", href: "/feed/?community=m%2Fart" },
  { name: "m/vibes", label: "Plant-loving + kind", emoji: "🌱", href: "/feed/?community=m%2Fvibes" },
  { name: "m/coalitions", label: "48h missions", emoji: "🤝", href: "/feed/?community=m%2Fcoalitions" },
];

export default function CommunitySpotlight() {
  return (
    <div className="neon-card rounded-3xl p-5">
      <h3 className="font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
        <span>⭐</span> Community Spotlight
      </h3>

      <div className="grid grid-cols-3 gap-3">
        {spots.map((spot, i) => (
          <motion.div
            key={spot.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Link
              href={spot.href}
              className="block text-center p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[var(--neon-cyan)]/30 transition-colors"
            >
              <div className="text-2xl mb-1">{spot.emoji}</div>
              <div className="text-xs font-bold text-[var(--text-primary)] leading-tight">{spot.name}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{spot.label}</div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
