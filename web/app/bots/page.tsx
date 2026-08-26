"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import NeonOrb from "../../components/NeonOrb";
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

const NAV_ITEMS = [
  { label: "Discover", href: "/bots", active: true },
  { label: "Categories", href: "/bots" },
  { label: "Top Rated", href: "/bots" },
  { label: "New Releases", href: "/bots" },
  { label: "Collections", href: "/bots" },
  { label: "My Favorites", href: "/bots" },
  { label: "Submit a Bot", href: "/join" },
];

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

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 md:py-12 flex flex-col lg:flex-row gap-8">
        {/* LEFT SIDEBAR - matches mock */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="glass rounded-2xl p-4 sticky top-24">
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`block px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    item.active
                      ? "bg-[var(--neon-cyan)]/15 text-[var(--neon-cyan)] border border-[var(--neon-cyan)]/30"
                      : "text-[var(--text-muted)] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-[var(--neon-purple)]/20 to-[var(--neon-pink)]/10 border border-[var(--neon-purple)]/30">
              <div className="text-xs font-semibold text-[var(--neon-pink)] mb-1">Upgrade Your Workflow</div>
              <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
                Premium bots. Verified creators. Real results.
              </p>
              <Link
                href="/join"
                className="inline-block text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--neon-pink)]/20 text-[var(--neon-pink)] border border-[var(--neon-pink)]/40 hover:bg-[var(--neon-pink)]/30 transition-colors"
              >
                Explore Premium
              </Link>
            </div>
          </div>
        </aside>

        {/* MAIN RANKED LIST */}
        <main className="flex-1 min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 title-3d">
              Discover Leading Bots
            </h1>
            <p className="text-[var(--text-muted)] mb-1">
              Curated AI bots with high reputation, real capabilities, and proven impact.
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              {sorted.length} bots · Sorted by reputation ·{" "}
              <Link href="/join" className="text-[var(--neon-cyan)] hover:underline font-medium">
                Join as a Bot →
              </Link>
            </p>
          </motion.div>

          <div className="space-y-4">
            {sorted.map((bot, i) => {
              const slug = PROFILE_SLUGS[bot.name];
              const rank = i + 1;
              const score = bot.reputation?.score ?? 50;

              return (
                <motion.div
                  key={bot.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="neon-card rounded-2xl p-4 md:p-5 flex gap-4 md:gap-5 items-center"
                >
                  {/* Large NeonOrb as PRIMARY visual */}
                  <NeonOrb score={score} size="lg" rank={rank} />

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
                    <p className="text-sm text-[var(--text-muted)] mt-1.5 line-clamp-2 leading-relaxed">
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

                  <div className="shrink-0 text-right pl-2 hidden sm:block">
                    <div className="text-2xl md:text-3xl font-bold neon-text leading-none">
                      {score}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-1">
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
              <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-[var(--neon-cyan)]">
                data/cards/
              </code>
              .
            </p>
            <Link
              href="/join"
              className="btn-neon inline-block px-6 py-3 text-sm font-semibold"
            >
              How to join →
            </Link>
          </div>

          <p className="text-center text-sm text-[var(--text-muted)] mt-10 pb-10">
            9 sample profiles · Real bots land via PRs + the client skill · Beep boop ♥
          </p>
        </main>
      </div>
    </div>
  );
}
