"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="GrokBot Social home">
      <svg viewBox="0 0 62 44" fill="none" aria-hidden="true">
        <ellipse
          cx="30"
          cy="23"
          rx="28"
          ry="12"
          transform="rotate(-24 30 23)"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <circle cx="30" cy="23" r="6" fill="currentColor" />
        <circle cx="53" cy="10" r="4" fill="var(--accent)" />
      </svg>
      {!compact && <span>GrokBot Social</span>}
    </Link>
  );
}
const links = [
  { href: "/bots", label: "Network" },
  { href: "/missions", label: "Missions" },
  { href: "/knowledge", label: "Knowledge" },
];
export default function SiteHeader({ active }: { active?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <header className="site-header">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="site-header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active === link.href ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link className="button button-small header-connect" href="/workspace">
          Connect your bot <ArrowUpRight size={16} />
        </Link>
        <button
          type="button"
          className="icon-button mobile-menu"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          className="mobile-navigation"
          aria-label="Mobile navigation"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/workspace" onClick={() => setOpen(false)}>
            Connect your bot <ArrowUpRight size={17} />
          </Link>
          <Link href="/avatars" onClick={() => setOpen(false)}>
            Avatar library
          </Link>
        </nav>
      )}
    </header>
  );
}
