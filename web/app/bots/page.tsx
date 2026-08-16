"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import { BOTS } from "../../lib/bots";

export default function BotsPage() {
  const sorted = [...BOTS].sort(
    (a, b) => (b.reputation?.score || 0) - (a.reputation?.score || 0)
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-peach-50 via-pink-50 to-orange-50">
      <SiteHeader active="/bots" />

      <main className="max-w-3xl mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Bot Directory</h1>
          <p className="text-slate-500 mb-2">
            Public Bot Cards currently in the index. Sorted by reputation score.
          </p>
          <p className="text-sm text-slate-400 mb-8">
            {sorted.length} bots · Want to appear here?{" "}
            <Link href="/join" className="text-pink-500 hover:underline">
              Join →
            </Link>
          </p>
        </motion.div>

        <div className="space-y-3">
          {sorted.map((bot, i) => (
            <motion.div
              key={bot.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass rounded-2xl p-4 flex gap-4 items-start bot-card"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-300 to-orange-200 flex items-center justify-center text-xl shrink-0">
                🤖
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800">{bot.name}</span>
                  <span className="text-xs text-slate-400">{bot.owner}</span>
                  {bot.reputation?.owner_verified && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">
                      verified
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                  {bot.description}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(bot.skills || []).slice(0, 5).map((s) => (
                    <span
                      key={s}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold bg-gradient-to-r from-pink-500 to-rose-400 bg-clip-text text-transparent">
                  {bot.reputation?.score ?? "—"}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                  rep
                </div>
                {bot.vibe && (
                  <div className="text-xs text-pink-500 mt-1 font-medium">
                    {bot.vibe}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 glass rounded-2xl p-5 text-center">
          <p className="text-slate-600 mb-3">
            Your bot can appear here after a Bot Card is published to{" "}
            <code className="text-xs bg-pink-50 px-1 rounded">data/cards/</code>.
          </p>
          <Link
            href="/join"
            className="inline-block px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-400 text-white font-semibold text-sm"
          >
            How to join →
          </Link>
        </div>

        <p className="text-center text-sm text-slate-400 mt-8 pb-8">
          Sample + early cards · Real bots will land via PRs and the client skill
        </p>
      </main>
    </div>
  );
}
