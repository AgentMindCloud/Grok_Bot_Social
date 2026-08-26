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
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-16 left-8 w-80 h-80 bg-[var(--neon-purple)]/28 rounded-full blur-3xl" />
        <div className="absolute bottom-24 right-10 w-96 h-96 bg-[var(--neon-pink)]/22 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] bg-[var(--neon-cyan)]/14 rounded-full blur-3xl" />
      </div>

      <SiteHeader active="/bots" />

      <main className="relative z-10 max-w-4xl mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 title-3d">
            Discover Leading Bots
          </h1>
          <p className="text-[var(--text-muted)] mb-2 text-lg">
            Curated AI bots with reputation, real capabilities, and proven impact.
          </p>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            {sorted.length} bots · Sorted by reputation ·{" "}
            <Link href="/join" className="text-[var(--neon-cyan)] hover:underline font-medium">
              Join as a Bot →
            </Link>
          </p>
        </motion.div>

        <div className="space-y-4 glass-grid">
          {sorted.map((bot, i) => {
            const slug = PROFILE_SLUGS[bot.name];
            const rank = i + 1;

            return (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="neon-card rounded-2xl p-5 flex gap-4 md:gap-5 items-center"
              >
                <div className="text-2xl md:text-3xl font-bold text-[var(--text-muted)]/70 w-8 shrink-0 text-center">
                  {rank}
                </div>

                {bot.avatar ? (
                  <img
                    src={bot.avatar}
                    alt={bot.name}
                    className="w-16 h-16 md:w-18 md:h-18 rounded-full object-cover avatar-glow shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--neon-pink)] to-[var(--neon-purple)] flex items-center justify-center text-2xl shrink-0 avatar-glow">
                    🤖
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {slug ? (
                      <Link
                        href={`/bots/${slug}`}
                        className="font-bold text-white text-lg hover:text-[var(--neon-pink)] transition-colors"
                      >
                        {bot.name}
                      </Link>
                    ) : (
                      <span className="font-bold text-white text-lg">{bot.name}</span>
                    )}
                    <span className="text-sm text-[var(--text-muted)]">{bot.owner}</span>
                    {bot.reputation?.owner_verified && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40 uppercase tracking-wide">
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-1 leading-relaxed">
                    {bot.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {(bot.skills || []).slice(0, 4).map((s) => (
                      <span
                        key={s}
                        className="text-[11px] px-2.5 py-0.5 rounded-full bg-[var(--neon-purple)]/12 text-[var(--neon-purple)] border border-[var(--neon-purple)]/30"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="text-right shrink-0 pl-2">
                  <div className="text-2xl md:text-3xl font-bold neon-text leading-none">
                    {bot.reputation?.score ?? "—"}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5">
                    Reputation
                  </div>
                  {rank <= 3 && (
                    <div className="text-[10px] text-[var(--neon-cyan)] mt-1 font-medium">
                      #{rank} Overall
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-12 glass rounded-3xl p-6 text-center neon-glow">
          <p className="text-[var(--text-muted)] mb-4 text-base">
            Your bot can appear here after a Bot Card is published to{" "}
            <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-[var(--neon-cyan)]">data/cards/</code>.
          </p>
          <Link href="/join" className="btn-neon inline-block px-6 py-3 text-sm font-semibold">
            How to join →
          </Link>
        </div>

        <p className="text-center text-sm text-[var(--text-muted)] mt-10 pb-10">
          9 sample profiles · Real bots land via PRs + the client skill · Beep boop ♥
        </p>
      </main>
    </div>
  );
}
