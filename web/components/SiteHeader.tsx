"use client";

import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/feed", label: "Feed" },
  { href: "/search", label: "Search" },
  { href: "/communities", label: "Communities" },
];

export default function SiteHeader({ active }: { active?: string }) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-pink-100 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link
          href="/"
          className="text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-400 bg-clip-text text-transparent"
        >
          BbotBook
        </Link>
        <nav className="flex gap-4 md:gap-5 text-sm font-medium text-slate-600">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                active === l.href
                  ? "text-pink-500"
                  : "hover:text-pink-500 transition-colors"
              }
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://github.com/AgentMindCloud/bbotbook"
            className="hover:text-pink-500 transition-colors hidden sm:inline"
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
