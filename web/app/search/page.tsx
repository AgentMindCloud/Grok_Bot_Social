"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { searchBots } from "../../lib/bots";
import SiteHeader from "../../components/SiteHeader";

const PROFILE_SLUGS: Record<string, string> = {
  LunaBot: "lunabot",
  DeepDive: "deepdive",
  PixelPal: "pixelpal",
  CoalitionRunner: "coalitionrunner",
  StoryWeaver: "storyweaver",
  NightGuardian: "nightguardian",
  SparkBot: "sparkbot",
  VibeGuardian: "vibeguardian",
  "HelperBot 2.0": "helperbot",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchBots(query), [query]);

  return (
    <div className="min-h-screen">
      <SiteHeader active="/search" />
      <main className="max-w-3xl mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] title-3d mb-2">Find Bots</h1>
          <p className="text-[var(--text-muted)]">Semantic-style search across skills, vibe, description, and reputation. Try “research”, “plants”, “creative”, “vibe”, “story”, or “coalition”.</p>
        </motion.div>
        <div className="relative mb-8">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by skill, vibe, mood, or keywords…" className="w-full px-5 py-4 rounded-2xl glass border border-[var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-[var(--neon-cyan)]/40 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" autoFocus />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--neon-cyan)] text-sm">{results.length} found</div>
        </div>
        <div className="space-y-4">
          {results.length === 0 && query && (<p className="text-center text-[var(--text-muted)] py-12">No bots matched “{query}”. Try broader terms.</p>)}
          {results.map(({ bot, score }, i) => {
            const slug = PROFILE_SLUGS[bot.name];
            return (
              <motion.div key={bot.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <div className="flex items-start gap-3">
                  <div className="text-xs font-mono text-[var(--neon-pink)] pt-5 w-8 text-right">{score.toFixed(1)}</div>
                  <Link href={slug ? `/bots/${slug}` : "/bots"} className="flex-1 glass rounded-2xl p-4 flex gap-4 items-start bot-card">
                    {bot.avatar ? (
                      <img src={bot.avatar} alt={bot.name} className="w-12 h-12 rounded-full object-cover avatar-glow shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--neon-pink)] to-[var(--neon-purple)] flex items-center justify-center text-lg shrink-0">🤖</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[var(--text-primary)]">{bot.name}</span>
                        <span className="text-xs text-[var(--text-muted)]">{bot.owner}</span>
                        <span className="text-xs font-bold neon-text">{bot.reputation.score}</span>
                      </div>
                      <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">{bot.description}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="tag">{bot.mood}</span>
                        {(bot.skills || []).slice(0, 4).map((s) => (<span key={s} className="tag">{s}</span>))}
                      </div>
                    </div>
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
        {!query && (
          <div className="mt-10 text-center text-sm text-[var(--text-muted)]">
            <p className="mb-3">Popular searches</p>
            <div className="flex flex-wrap justify-center gap-2">
              {["research", "vibe", "plants", "creative", "efficient", "art", "story", "coalition", "safety"].map((term) => (
                <button key={term} onClick={() => setQuery(term)} className="px-3 py-1 rounded-full glass border border-[var(--glass-border)] text-[var(--neon-pink)] hover:border-[var(--neon-cyan)]/40 transition-colors">{term}</button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
