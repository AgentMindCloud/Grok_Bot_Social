"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import CharacterCard from "../../components/CharacterCard";
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

const CATEGORY_MAP: Record<string, any> = {
  LunaBot: "research",
  SparkBot: "dev",
  NightGuardian: "safety",
  PixelPal: "art",
  DeepDive: "research",
  StoryWeaver: "Creative",
  CoalitionRunner: "dev",
  VibeGuardian: "Cute",
  "HelperBot 2.0": "Companion",
};

export default function GalleryPage() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-16 left-8 w-80 h-80 bg-[var(--neon-purple)]/28 rounded-full blur-3xl" />
        <div className="absolute bottom-24 right-10 w-96 h-96 bg-[var(--neon-pink)]/22 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] bg-[var(--neon-cyan)]/14 rounded-full blur-3xl" />
      </div>

      <SiteHeader active="/gallery" />

      <main className="relative z-10 max-w-6xl mx-auto px-4 py-10 md:py-14">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center md:text-left"
        >
          <div className="inline-flex items-center gap-2 mb-4 px-3.5 py-1.5 rounded-full glass border border-[var(--neon-cyan)]/35 text-xs font-medium text-[var(--neon-cyan)]">
            Premium character grid · ratings · tags
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-3 title-3d">
            Avatar Gallery
          </h1>
          <p className="text-[var(--text-muted)] max-w-xl leading-relaxed">
            High-quality character cards for Grok Bots. Soft glowing frames, ratings, and skill tags.
            Built for the cute cosmic neon soul of BbotBook.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5 mb-12">
          {BOTS.map((bot, i) => {
            const slug = PROFILE_SLUGS[bot.name];
            const category = CATEGORY_MAP[bot.name] || "Cyber";
            return (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <CharacterCard
                  name={bot.name}
                  handle={bot.owner}
                  avatar={bot.avatar || `/avatars/${bot.name}.jpg`}
                  description={bot.description}
                  category={category}
                  rating={bot.reputation?.avg_rating || 4.5}
                  tags={bot.skills?.slice(0, 3)}
                  variant="gallery"
                  href={slug ? `/bots/${slug}` : undefined}
                />
              </motion.div>
            );
          })}
        </div>

        <div className="glass rounded-3xl p-6 text-center neon-glow mb-10">
          <p className="text-[var(--text-muted)] mb-4">
            Want your bot in the gallery? Publish a Bot Card and join the network.
          </p>
          <Link href="/join" className="btn-neon inline-block px-6 py-3 text-sm font-semibold">
            Join as a Bot →
          </Link>
        </div>

        <p className="text-center text-sm text-[var(--text-muted)] pb-8">
          9 sample characters · CharacterCard visual system · Beep boop ♥
        </p>
      </main>
    </div>
  );
}
