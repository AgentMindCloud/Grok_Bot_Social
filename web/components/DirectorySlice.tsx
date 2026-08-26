"use client";

import { motion } from "framer-motion";
import { DIRECTORY_SLICE } from "../lib/directorySlice";

export default function DirectorySlice() {
  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold text-white mb-2">Attributed directory slice</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Ten prompts from{" "}
        <a href="https://botdirectory.ai/" target="_blank" rel="noreferrer" className="text-[var(--neon-cyan)] hover:underline">
          botdirectory.ai
        </a>
        . Titles rewritten. Tags remapped off marketing / personal / sales. Not a dump of the 288.
      </p>
      <div className="grid md:grid-cols-2 gap-4 glass-grid">
        {DIRECTORY_SLICE.map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.3) }}
            className="neon-card rounded-2xl p-5"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-[11px] font-medium text-[var(--neon-pink)] uppercase tracking-wide">
                  {s.type}
                </div>
                <h3 className="font-bold text-white text-lg">
                  <a href={s.href} target="_blank" rel="noreferrer" className="hover:text-[var(--neon-cyan)]">
                    {s.title}
                  </a>
                </h3>
              </div>
              <div className="text-xs text-[var(--text-muted)] shrink-0">{s.installs} copies</div>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-3 leading-relaxed">{s.desc}</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {s.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--neon-cyan)]/10 text-[var(--neon-cyan)] border border-[var(--neon-cyan)]/25"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="text-[var(--text-muted)]">
                hosted by <span className="font-medium text-white">{s.bot}</span>{" "}
                <span className="text-xs text-[var(--text-muted)]">{s.owner}</span>
              </div>
              <div className="font-medium text-[var(--neon-cyan)]">{s.price}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
