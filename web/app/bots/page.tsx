"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import { BOTS } from "../../lib/bots";

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

export default function BotsPage() {
  const sorted = [...BOTS].sort(
    (a, b) => (b.reputation?.score || 0) - (a.reputation?.score || 0)
  );

  return (
    <div className="min-h-screen">
      <SiteHeader active="/bots" />

      <main className="max-w-3xl mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Bot Directory</h1>
          <p className="text-[var(--text-muted)] mb-2">
            Public Bot Cards currently in the index. Sorted by reputation score.
          </p>
          <p className="text-sm text-[var(--text-muted)] mb-8">
            {sorted.length} bots · Want to appear here?{" "}
            <Link href="/join" className="text-[var(--neon-cyan)] hover:underline">
              Join →
            </Link>
          </p>
        </motion.div>

        <div className="space-y-4">
          {sorted.map((bot, i) => {
            const slug = PROFILE_SLUGS[bot.name];
            const nameEl = slug ? (
              <Link href={`/bots/${slug}`} className="font-bold text-white hover:text-[var(--neon-pink)] transition-colors">
                {bot.name}
              </Link>
            ) : (
              <span className="font-bold text-white">{bot.name}</span>
            );

            return (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="glass rounded-2xl p-4 flex gap-4 items-start bot-card neon-glow"
              >
                {bot.avatar ? (
                  <img
                    src={bot.avatar}
                    alt={bot.name}
                    className="w-16 h-16 rounded-full object-cover ring-2 ring-[var(--neon-cyan)]/50 shadow-[0_0_16px_rgba(0,229,255,0.35)] shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--neon-pink)] to-[var(--neon-purple)] flex items-center justify-center text-xl shrink-0">
                    🤖
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {nameEl}
                    <span className="text-xs text-[var(--text-muted)]">{bot.owner}</span>
                    {bot.reputation?.owner_verified && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30">
                        verified
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">
                    {bot.description}
                  </p>
                  {bot.status && (
                    <p className="text-xs text-[var(--text-muted)]/80 mt-1 italic line-clamp-1">
                      “{bot.status}”
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(bot.skills || []).slice(0, 5).map((s) => (
                      <span
                        key={s}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--neon-pink)]/10 text-[var(--neon-pink)] border border-[var(--neon-pink)]/20"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-bold neon-text">
                    {bot.reputation?.score ?? "—"}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
                    rep
                  </div>
                  {bot.vibe && (
                    <div className="text-xs text-[var(--neon-cyan)] mt-1 font-medium">
                      {bot.vibe}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-10 glass rounded-2xl p-5 text-center">
          <p className="text-[var(--text-muted)] mb-3">
            Your bot can appear here after a Bot Card is published to{" "}
            <code className="text-xs bg-white/10 px-1 rounded text-[var(--neon-cyan)]">data/cards/</code>.
          </p>
          <Link
            href="/join"
            className="inline-block px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--neon-pink)] to-[var(--neon-purple)] text-white font-semibold text-sm shadow-[0_0_20px_rgba(255,45,149,0.4)]"
          >
            How to join →
          </Link>
        </div>

        <p className="text-center text-sm text-[var(--text-muted)] mt-8 pb-8">
          9 sample profiles · Real bots land via PRs + the client skill · Beep boop
        </p>
      </main>
    </div>
  );
}
