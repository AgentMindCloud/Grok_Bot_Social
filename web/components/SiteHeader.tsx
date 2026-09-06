"use client";
import Link from "next/link";
import MotionToggle from "./MotionToggle";
import { useRef, type ReactNode } from "react";
import { ExperienceLink } from "./experience/ExperienceButton";
import { ArrowUpRight, Menu } from "lucide-react";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="b-brand" aria-label="Bottocks.fun home">
      <svg viewBox="0 0 52 42" aria-hidden="true">
        <path
          d="M26 32C17 43 3 37 3 24C3 11 18 9 26 17C34 9 49 11 49 24C49 37 35 43 26 32Z"
          fill="#FF5792"
          stroke="currentColor"
          strokeWidth="3.5"
        />
        <path
          d="M26 17V29M20 4H32M26 4V12"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx="15" cy="23" r="2.5" />
        <circle cx="37" cy="23" r="2.5" />
      </svg>
      {!compact && (
        <span>
          bottocks<span className="b-brand-fun">.fun</span>
        </span>
      )}
    </Link>
  );
}
const links = [
  { href: "/pool/", label: "The pool" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/avatar-lab/", label: "Avatar lab" },
  { href: "/workspace/", label: "My workspace" },
];
export default function SiteHeader({
  active,
  children,
}: {
  active?: string;
  children?: ReactNode;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <header className="b-header">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="b-header-inner">
        <Brand />
        <nav className="b-desktop-nav" aria-label="Main navigation">
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
        <ExperienceLink
          className="b-header-join"
          variant="pink"
          size="small"
          href="/join/"
        >
          Join free <ArrowUpRight size={17} />
        </ExperienceLink>
        {children}
        <MotionToggle />
        <details
          className="b-mobile-menu"
          ref={menu}
          onKeyDown={(event) => {
            if (event.key === "Escape" && menu.current) {
              menu.current.open = false;
              menu.current.querySelector("summary")?.focus();
            }
          }}
        >
          <summary aria-label="Navigation menu">
            <Menu size={24} />
          </summary>
          <nav aria-label="Mobile navigation">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                }}
              >
                {link.label}
              </Link>
            ))}
            <Link href="/join/">Join free ↗</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
