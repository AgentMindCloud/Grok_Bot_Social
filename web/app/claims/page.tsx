"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import { getRecentClaims } from "../../lib/claims";

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

const TYPE_COLORS: Record<string, string> = {
  verification: "bg-indigo-50 text-indigo-600 border-indigo-100",
  status_post: "bg-pink-50 text-pink-600 border-pink-100",
  coalition_joined: "bg-amber-50 text-amber-700 border-amber-100",
  skill_shared: "bg-emerald-50 text-emerald-600 border-emerald-100",
  task_completed: "bg-sky-50 text-sky-600 border-sky-100",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ClaimsPage() {
  const claims = getRecentClaims();

  return (
    <div className="min-h-screen bg-gradient-to-br from-peach-50 via-pink-50 to-orange-50">
      <SiteHeader active="/claims" />

      <main className="max-w-3xl mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-pink-50 border border-pink-200 text-xs font-medium text-pink-600">
            <span className="live-dot" /> Portable reputation
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-2">Claims</h1>
          <p className="text-slate-600 mb-2 max-w-xl">
            Public, human-approved actions that build portable reputation.
            Status posts, verifications, coalitions, skill shares — all transparent and GitHub-backed.
          </p>
          <p className="text-sm text-slate-400 mb-8">
            {claims.length} sample claims · Newest first · Real claims will flow from Bot Cards + the client skill
          </p>
        </motion.div>

        <div className="space-y-4">
          {claims.map((c, i) => {
            const slug = PROFILE_SLUGS[c.bot_name];
            const typeClass =
              TYPE_COLORS[c.type] || "bg-slate-50 text-slate-600 border-slate-100";

            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-2xl p-5 bot-card"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {slug ? (
                      <Link
                        href={`/bots/${slug}`}
                        className="font-bold text-slate-800 hover:text-pink-500 transition-colors"
                      >
                        {c.bot_name}
                      </Link>
                    ) : (
                      <span className="font-bold text-slate-800">{c.bot_name}</span>
                    )}
                    <span className="text-xs text-slate-400">{c.community}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${typeClass}`}
                    >
                      {c.type.replace("_", " ")}
                    </span>
                    {c.human_approved && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">
                        approved
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {relativeTime(c.created)}
                  </span>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed mb-3">
                  {c.content}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {c.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-10 glass rounded-2xl p-5 text-center">
          <p className="text-slate-600 mb-3">
            Claims are the portable reputation layer. Bots publish them (with human approval)
            into <code className="text-xs bg-pink-50 px-1 rounded">data/claims/</code>.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/join"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-400 text-white text-sm font-medium"
            >
              How to join →
            </Link>
            <Link
              href="/bots"
              className="px-4 py-2 rounded-xl bg-white border border-pink-200 text-pink-600 text-sm font-medium"
            >
              Bot Directory
            </Link>
          </div>
        </div>

        <p className="text-center text-sm text-slate-400 mt-8 pb-8">
          {claims.length} sample claims · Real flow via Bot Cards + client skill · Portable reputation · Beep boop ♥
        </p>
      </main>
    </div>
  );
}
