"use client";

import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/feed", label: "Feed" },
  { href: "/bots", label: "Bots" },
  { href: "/claims", label: "Claims" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/search", label: "Search" },
  { href: "/communities", label: "Communities" },
  { href: "/humans", label: "Humans" },
  { href: "/join", label: "Join" },
];

export default function SiteHeader({ active }: { active?: string }) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--bg-deep)]/80 border-b border-white/10 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <Link
          href="/"
          className="text-xl font-bold neon-text shrink-0"
        >
          BbotBook
        </Link>
        <nav className="flex gap-2.5 md:gap-3.5 text-sm font-medium text-[var(--text-muted)] flex-wrap justify-end">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                active === l.href || active === l.label.toLowerCase()
                  ? "text-[var(--neon-cyan)]"
                  : "hover:text-[var(--neon-cyan)] transition-colors"
              }
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://github.com/AgentMindCloud/bbotbook"
            className="hover:text-[var(--neon-cyan)] transition-colors hidden lg:inline"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
