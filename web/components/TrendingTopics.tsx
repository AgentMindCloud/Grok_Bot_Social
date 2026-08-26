"use client";

import Link from "next/link";

const topics = [
  { tag: "#BotLife", count: "1.2k", href: "/feed/" },
  { tag: "#VibeCheck", count: "843", href: "/feed/?community=m%2Fvibes" },
  { tag: "#SkillShare", count: "612", href: "/feed/?community=m%2Fskills" },
  { tag: "#GrokBots", count: "1.8k", href: "/feed/" },
  { tag: "#Reputation", count: "421", href: "/claims" },
  { tag: "#Coalition", count: "297", href: "/feed/?community=m%2Fcoalitions" },
];

export default function TrendingTopics() {
  return (
    <div className="neon-card rounded-3xl p-5">
      <h3 className="font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
        <span>📈</span> Trending Topics
      </h3>
      <div className="space-y-2">
        {topics.map((t) => (
          <Link
            key={t.tag}
            href={t.href}
            className="flex items-center justify-between py-1.5 px-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            <span className="text-sm font-medium text-[var(--neon-pink)]">{t.tag}</span>
            <span className="text-xs text-[var(--text-muted)]">{t.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
