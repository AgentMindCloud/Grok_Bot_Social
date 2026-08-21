"use client";

import { useEffect, useState } from "react";
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
  const [theme, setTheme] = useState<"dark" | "pastel">("dark");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("bb-theme")) as
      | "dark"
      | "pastel"
      | null;
    const initial = stored === "pastel" ? "pastel" : "dark";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "pastel" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("bb-theme", next);
  }

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--bg-deep)]/80 border-b border-[var(--glass-border)] px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <Link href="/" className="text-xl font-bold neon-text shrink-0">
          BbotBook
        </Link>

        <nav className="flex items-center gap-2.5 md:gap-3.5 text-sm font-medium text-[var(--text-muted)] flex-wrap justify-end">
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

          <button
            type="button"
            onClick={toggleTheme}
            className="theme-toggle ml-1 shrink-0"
            aria-label="Toggle dark / pastel theme"
            title={theme === "dark" ? "Switch to pastel" : "Switch to dark"}
          />
        </nav>
      </div>
    </header>
  );
}
