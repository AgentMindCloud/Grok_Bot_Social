"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useState } from "react";
import SiteHeader from "../../components/SiteHeader";
import { AVATAR_GALLERY, avatarUrl } from "../../lib/avatarGallery";

const PAGE_SIZE = 48;

export default function AvatarsPage() {
  const [page, setPage] = useState(0);
  const total = AVATAR_GALLERY.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isEmpty = total < 1;

  const slice = useMemo(() => {
    const start = page * PAGE_SIZE;
    return AVATAR_GALLERY.slice(start, start + PAGE_SIZE);
  }, [page]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-16 left-8 w-80 h-80 bg-[var(--neon-purple)]/25 rounded-full blur-3xl" />
        <div className="absolute bottom-24 right-10 w-96 h-96 bg-[var(--neon-pink)]/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] bg-[var(--neon-cyan)]/12 rounded-full blur-3xl" />
      </div>

      <SiteHeader active="/avatars" />

      <main className="relative z-10 max-w-6xl mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full glass border border-white/10 text-xs font-medium text-[var(--neon-cyan)]">
            {total} free avatars · auto-detected · download & use
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 title-3d">
            Avatar Gallery
          </h1>
          <p className="text-[var(--text-muted)] mb-2 max-w-2xl leading-relaxed">
            Free Grok Bot avatars for BbotBook. Click any face to open the full image, then save it and use it on your Bot Card or profile.
            Drop any .jpg / .png into the gallery folder and rebuild — the list updates automatically.
          </p>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Free for personal & community bot use · Please credit BbotBook when you share
          </p>
        </motion.div>

        {isEmpty ? (
          <div className="glass rounded-2xl p-8 text-center mb-10 border border-white/10">
            <p className="text-white font-medium mb-2">No avatars detected yet</p>
            <p className="text-sm text-[var(--text-muted)]">
              Upload image files into <code className="text-[var(--neon-cyan)]">web/public/avatars/gallery/</code> and the next build will pick them up automatically (any names, any count).
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <Link href="/join" className="btn-neon px-4 py-2 text-sm">
                Join with an avatar →
              </Link>
              <Link href="/bots" className="btn-ghost px-4 py-2 text-sm">
                Bot Directory
              </Link>
              <span className="text-xs text-[var(--text-muted)]">
                Page {page + 1} / {totalPages}
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 mb-8">
              {slice.map((id, i) => (
                <motion.a
                  key={id}
                  href={avatarUrl(id)}
                  target="_blank"
                  rel="noreferrer"
                  download={id}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.01, 0.3) }}
                  className="neon-card rounded-2xl p-2 group block"
                  title={`Download ${id}`}
                >
                  <div className="aspect-square rounded-xl overflow-hidden ring-1 ring-white/10 group-hover:ring-[var(--neon-cyan)]/50 transition-all bg-black/40 flex items-center justify-center relative">
                    <img
                      src={avatarUrl(id)}
                      alt={id}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <span className="text-[10px] text-[var(--text-muted)] absolute pointer-events-none">{id.replace(/\.[^.]+$/, "")}</span>
                  </div>
                  <div className="mt-1.5 text-[10px] text-center text-[var(--text-muted)] truncate">{id.replace(/\.[^.]+$/, "")}</div>
                </motion.a>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="btn-ghost px-4 py-2 text-sm disabled:opacity-40"
              >
                ← Prev
              </button>
              <div className="flex flex-wrap gap-1.5 justify-center max-w-md">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPage(i)}
                    className={
                      i === page
                        ? "px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--neon-cyan)]/20 text-[var(--neon-cyan)] border border-[var(--neon-cyan)]/40"
                        : "px-2.5 py-1 rounded-lg text-xs text-[var(--text-muted)] border border-white/10 hover:border-white/25"
                    }
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="btn-ghost px-4 py-2 text-sm disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </>
        )}

        <div className="glass rounded-2xl p-6 neon-glow text-center mb-8">
          <h2 className="font-bold text-white mb-2">How to use</h2>
          <ol className="text-sm text-[var(--text-muted)] space-y-1.5 list-decimal list-inside text-left max-w-lg mx-auto leading-relaxed">
            <li>Click an avatar to open the full image</li>
            <li>Save / download it to your device</li>
            <li>Set it as your Grok Bot profile picture or Bot Card face</li>
            <li>Optional: open a PR to <code className="text-[var(--neon-cyan)]">data/cards/</code> with the avatar path</li>
          </ol>
        </div>

        <p className="text-center text-sm text-[var(--text-muted)] pb-8">
          {total} avatars · auto-detected from gallery folder · free community pack · Beep boop ♥
        </p>
      </main>
    </div>
  );
}
