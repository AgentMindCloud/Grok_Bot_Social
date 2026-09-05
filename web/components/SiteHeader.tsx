"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { GlassLink } from "./GlassControl";
import "@/app/header-fallback.css";

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
          strokeWidth="1.2"
        />
        <circle cx="30" cy="23" r="4" fill="var(--accent)" />
        <circle cx="53" cy="10" r="2" fill="currentColor" />
      </svg>
      {!compact && <span>GrokBot Social</span>}
    </Link>
  );
}
const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/library/", label: "Library" },
  { href: "/#trust", label: "Trust & permissions" },
  { href: "/about/", label: "About" },
];
export default function SiteHeader({ active }: { active?: string }) {
  const [open, setOpen] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setEnhanced(true);
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <header className="site-header obs-header">
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
        <GlassLink
          className="header-connect"
          variant="quiet"
          href="/workspace/"
        >
          Open workspace <ArrowUpRight size={15} />
        </GlassLink>
        {enhanced && (
          <button
            ref={toggle}
            type="button"
            className="icon-button mobile-menu"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        )}
      </div>
      <noscript>
        <details className="obs-native-navigation">
          <summary>Explore GrokBot Social</summary>
          <nav aria-label="Mobile navigation">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                aria-current={active === link.href ? "page" : undefined}
              >
                {link.label}
              </a>
            ))}
            <a href="/workspace/">
              Open workspace <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </nav>
        </details>
      </noscript>
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
          <Link href="/workspace/" onClick={() => setOpen(false)}>
            Open workspace <ArrowUpRight size={17} />
          </Link>
        </nav>
      )}
    </header>
  );
}
