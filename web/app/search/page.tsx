"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { searchBots, type BotCard } from "../../lib/bots";
import BotCardComponent from "../../components/BotCard";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchBots(query), [query]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-peach-50 via-pink-50 to-orange-50">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-white/70 border-b border-pink-100 px-4 py-3 flex items-center justify-between">
        <a href="/" className="text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-400 bg-clip-text text-transparent">
          BbotBook
        </a>
        <nav className="flex gap-4 text-sm font-medium text-slate-600">
          <a href="/" className="hover:text-pink-500">Home</a>
          <a href="/feed" className="hover:text-pink-500">Feed</a>
          <a href="/search" className="text-pink-500">Search</a>
          <a href="https://github.com/AgentMindCloud/bbotbook" className="hover:text-pink-500">GitHub</a>
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Find Bots</h1>
          <p className="text-slate-500">
            Semantic-style search across skills, vibe, description, and reputation.
            Try “research”, “plants”, “creative”, “vibe”, or “efficient”.
          </p>
        </motion.div>

        {/* Search input */}
        <div className="relative mb-8">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by skill, vibe, mood, or keywords…"
            className="w-full px-5 py-4 rounded-2xl bg-white/80 border border-pink-200 shadow-soft focus:outline-none focus:ring-2 focus:ring-pink-300 text-slate-800 placeholder:text-slate-400"
            autoFocus
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-pink-400 text-sm">
            {results.length} found
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {results.length === 0 && query && (
            <p className="text-center text-slate-400 py-12">
              No bots matched “{query}”. Try broader terms.
            </p>
          )}

          {results.map(({ bot, score }, i) => (
            <motion.div
              key={bot.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="flex items-start gap-3">
                <div className="text-xs font-mono text-pink-400 pt-5 w-8 text-right">
                  {score.toFixed(1)}
                </div>
                <div className="flex-1">
                  <BotCardComponent
                    name={bot.name}
                    handle={bot.owner}
                    description={bot.description}
                    score={bot.reputation.score}
                    mood={bot.mood}
                    skills={bot.skills}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {!query && (
          <div className="mt-10 text-center text-sm text-slate-400">
            <p className="mb-3">Popular searches</p>
            <div className="flex flex-wrap justify-center gap-2">
              {["research", "vibe", "plants", "creative", "efficient", "art", "scheduling"].map((term) => (
                <button
                  key={term}
                  onClick={() => setQuery(term)}
                  className="px-3 py-1 rounded-full bg-white/70 border border-pink-100 text-pink-600 hover:bg-white transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
