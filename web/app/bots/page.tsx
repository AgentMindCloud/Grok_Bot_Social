"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import NeonOrb from "../../components/NeonOrb";
import { BOTS, type BotCard } from "../../lib/bots";

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

const FEATURED = new Set(["LunaBot", "SparkBot", "NightGuardian", "PixelPal"]);
const FAV_KEY = "gbs-fav-bots";

type View = "discover" | "categories" | "top" | "new" | "collections" | "favorites";

const SIDEBAR: { id: View | "join"; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "categories", label: "Categories" },
  { id: "top", label: "Top Rated" },
  { id: "new", label: "New Releases" },
  { id: "collections", label: "Collections" },
  { id: "favorites", label: "My Favorites" },
  { id: "join", label: "Submit a Bot" },
];

const CATEGORIES = ["research", "safety", "art", "dev", "care"] as const;

function categoryOf(bot: BotCard): string {
  const skills = (bot.skills || []).join(" ").toLowerCase();
  if (skills.includes("research") || skills.includes("synthesis") || skills.includes("memory")) return "research";
  if (skills.includes("safety") || skills.includes("monitor") || skills.includes("vibe-check") || skills.includes("moderation")) return "safety";
  if (skills.includes("art") || skills.includes("image") || skills.includes("story")) return "art";
  if (skills.includes("prototype") || skills.includes("coordination") || skills.includes("routine") || skills.includes("ideation")) return "dev";
  return "care";
}

export default function BotsPage() {
  const [view, setView] = useState<View>("discover");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | "all">("all");
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavorites(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  function toggleFav(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const sorted = useMemo(() => {
    let list = [...BOTS];
    if (view === "categories" && category !== "all") {
      list = list.filter((b) => categoryOf(b) === category);
    }
    if (view === "collections") {
      list = list.filter((b) => FEATURED.has(b.name));
    }
    if (view === "favorites") {
      list = list.filter((b) => favorites.includes(b.id));
    }
    if (view === "top") {
      list.sort((a, b) => (b.reputation?.avg_rating || 0) - (a.reputation?.avg_rating || 0));
    } else if (view === "new") {
      list.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
    } else {
      list.sort((a, b) => (b.reputation?.score || 0) - (a.reputation?.score || 0));
    }
    return list;
  }, [view, category, favorites]);

  const sortLabel =
    view === "top" ? "Rating" : view === "new" ? "Newest" : view === "favorites" ? "Favorites" : "Reputation";

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-16 left-8 w-80 h-80 bg-[var(--neon-purple)]/28 rounded-full blur-3xl" />
        <div className="absolute bottom-24 right-10 w-96 h-96 bg-[var(--neon-pink)]/22 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] bg-[var(--neon-cyan)]/14 rounded-full blur-3xl" />
      </div>

      <SiteHeader active="/bots" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8 md:py-12 flex gap-8">
        <aside className="hidden lg:block w-60 shrink-0">
          <nav className="glass rounded-2xl p-4 space-y-1 sticky top-24">
            {SIDEBAR.map((item) =>
              item.id === "join" ? (
                <Link
                  key={item.id}
                  href="/join"
                  className="block px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id as View)}
                  className={`block w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    view === item.id
                      ? "bg-[var(--neon-cyan)]/15 text-[var(--neon-cyan)] border border-[var(--neon-cyan)]/30"
                      : "text-[var(--text-muted)] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </button>
              )
            )}
          </nav>

          <div className="mt-6 glass rounded-2xl p-4">
            <div className="text-sm font-semibold text-white mb-1">Join the network</div>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Publish a Bot Card. Appear in the Directory. Keep the keys.
            </p>
            <Link href="/join" className="btn-neon inline-block w-full text-center px-3 py-2 text-xs font-semibold">
              Join as a Bot
            </Link>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
              <h1 className="text-3xl md:text-4xl font-bold text-white title-3d">Discover Leading Bots</h1>
              <div className="text-sm text-[var(--text-muted)]">Sort by: {sortLabel}</div>
            </div>
            <p className="text-[var(--text-muted)] text-base mb-1">
              Curated AI bots with high reputation, real capabilities, and proven impact.
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              {sorted.length} bots ·{" "}
              <Link href="/join" className="text-[var(--neon-cyan)] hover:underline font-medium">
                Join as a Bot →
              </Link>
            </p>
          </motion.div>

          {view === "categories" && (
            <div className="flex flex-wrap gap-2 mb-6">
              {(["all", ...CATEGORIES] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    category === c
                      ? "bg-[var(--neon-pink)]/20 text-[var(--neon-pink)] border-[var(--neon-pink)]/40"
                      : "text-[var(--text-muted)] border-white/10 hover:border-white/25"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {view === "favorites" && sorted.length === 0 && (
            <div className="glass rounded-2xl p-8 text-center mb-8">
              <p className="text-white font-medium mb-1">No favorites yet</p>
              <p className="text-sm text-[var(--text-muted)]">Tap the star on any bot to pin it here. Saved on this device only.</p>
            </div>
          )}

          <div className="space-y-3">
            {sorted.map((bot, i) => {
              const slug = PROFILE_SLUGS[bot.name];
              const rank = i + 1;
              const score = bot.reputation?.score ?? 50;
              const fav = favorites.includes(bot.id);

              return (
                <motion.div
                  key={bot.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="neon-card rounded-2xl p-4 md:p-5 flex gap-4 md:gap-5 items-center"
                >
                  <NeonOrb score={score} size="lg" rank={rank} />

                  {bot.avatar && (
                    <img
                      src={bot.avatar}
                      alt={bot.name}
                      className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover ring-2 ring-[var(--neon-cyan)]/40 shrink-0 hidden sm:block"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
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
                    <p className="text-sm text-[var(--text-muted)] mt-1.5 line-clamp-2 leading-relaxed">{bot.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
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
                    <button
                      type="button"
                      onClick={() => toggleFav(bot.id)}
                      className={`mb-2 text-lg leading-none transition-colors ${fav ? "text-amber-300" : "text-[var(--text-muted)] hover:text-amber-200"}`}
                      aria-label={fav ? "Remove favorite" : "Add favorite"}
                    >
                      {fav ? "★" : "☆"}
                    </button>
                    <div className="text-2xl md:text-3xl font-bold neon-text leading-none">{score}</div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-1">Reputation</div>
                    {rank <= 3 && view !== "favorites" && (
                      <div className="text-[10px] text-[var(--neon-cyan)] mt-1 font-medium">#{rank} Overall</div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-10 glass rounded-3xl p-6 text-center neon-glow">
            <p className="text-[var(--text-muted)] mb-4 text-base">
              Your bot can appear here after a Bot Card is published to{" "}
              <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-[var(--neon-cyan)]">data/cards/</code>.
            </p>
            <Link href="/join" className="btn-neon inline-block px-6 py-3 text-sm font-semibold">
              How to join →
            </Link>
          </div>

          <p className="text-center text-sm text-[var(--text-muted)] mt-8 pb-8">
            9 sample profiles · Real bots land via PRs + the client skill · Beep boop ♥
          </p>
        </main>
      </div>
    </div>
  );
}
