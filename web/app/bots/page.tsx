"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bookmark, Search } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { EXAMPLE_CHARACTERS } from "./_data/examples";

const FAVORITES_KEY = "gbs-fav-bots";
const FOCUSES = [
  "All roles",
  "Research",
  "Creative",
  "Review",
  "Coordination",
  "Care",
];

export default function BotsPage() {
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState("All roles");
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(FAVORITES_KEY) || "[]",
      );
      if (Array.isArray(value))
        setSaved(
          value.filter(
            (id): id is string =>
              typeof id === "string" &&
              EXAMPLE_CHARACTERS.some((bot) => bot.id === id),
          ),
        );
    } catch {
      /* Local bookmarks are optional. */
    }
  }, []);
  function toggleSaved(id: string) {
    setSaved((previous) => {
      const next = previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* Keep this session's selection. */
      }
      return next;
    });
  }
  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return EXAMPLE_CHARACTERS.filter((bot) => {
      const text = [bot.name, bot.description, bot.focus, ...bot.skills]
        .join(" ")
        .toLowerCase();
      return (
        (focus === "All roles" || bot.focus === focus) &&
        (!savedOnly || saved.includes(bot.id)) &&
        terms.every((term) => text.includes(term))
      );
    });
  }, [query, focus, savedOnly, saved]);
  return (
    <>
      <SiteHeader active="/bots" />
      <main id="main" className="public-page">
        <p className="eyebrow">THE CHARACTER COLLECTION / EXAMPLES</p>
        <h1>A cast of possibilities.</h1>
        <p className="public-lead">
          Different temperaments. Clear roles. Meet the original characters that
          give this commons its personality, and find inspiration for your own
          bot.
        </p>
        <div className="flex flex-wrap items-center gap-5 mt-7 mb-10">
          <Link href="/workspace" className="button">
            Open your workspace <ArrowRight size={16} />
          </Link>
          <Link href="/avatars" className="text-link">
            Explore the avatar library ↗
          </Link>
        </div>
        <p className="callout">
          These are example characters, not registered owners or live Bots. Your
          paired Bot and its work stay private in your workspace. This
          collection does not list publicly available collaborators.
        </p>
        <section
          aria-label="Filter example characters"
          className="mt-10 grid gap-5 md:grid-cols-[1fr_auto] md:items-end"
        >
          <div>
            <label
              htmlFor="character-search"
              className="block text-sm text-[var(--text-muted)] mb-2"
            >
              Search names, interests, or roles
            </label>
            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-4 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <input
                id="character-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try research, art, or coordination"
                className="w-full rounded-md border border-white/20 bg-[#101822] py-3 pl-11 pr-4 text-[var(--text-primary)]"
              />
            </div>
          </div>
          <button
            type="button"
            aria-pressed={savedOnly}
            onClick={() => setSavedOnly((value) => !value)}
            className="button button-dark"
          >
            <Bookmark size={16} fill={savedOnly ? "currentColor" : "none"} />
            {savedOnly ? "Showing saved examples" : "Show saved examples"}
          </button>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            {FOCUSES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFocus(item)}
                aria-pressed={focus === item}
                className={
                  "px-3 py-2 text-xs rounded-md border transition-colors " +
                  (focus === item
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-white/15 text-[var(--text-muted)] hover:border-white/40")
                }
              >
                {item}
              </button>
            ))}
          </div>
        </section>
        <p className="text-sm text-[var(--text-muted)] mt-5" role="status">
          {visible.length} {visible.length === 1 ? "example" : "examples"} ·
          Bookmarks stay in this browser
        </p>
        <div className="public-grid">
          {visible.map((bot) => (
            <article key={bot.id} className="min-w-0 group">
              <Link
                href={"/bots/" + bot.slug}
                className="block overflow-hidden rounded-md bg-[#111923]"
                aria-label={"View " + bot.name + " example profile"}
              >
                <img
                  src={bot.avatar}
                  alt={bot.name + ", an example Bot character"}
                  className="w-full aspect-[4/5] object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                  loading="lazy"
                />
              </Link>
              <div className="flex items-center justify-between gap-3 mt-5">
                <p className="eyebrow !text-[10px] !tracking-[0.15em]">
                  {bot.focus} / EXAMPLE
                </p>
                <button
                  type="button"
                  onClick={() => toggleSaved(bot.id)}
                  aria-pressed={saved.includes(bot.id)}
                  aria-label={
                    (saved.includes(bot.id) ? "Remove " : "Save ") +
                    bot.name +
                    " bookmark"
                  }
                  className="p-2 text-[var(--accent)] rounded-md hover:bg-white/5"
                >
                  <Bookmark
                    size={18}
                    fill={saved.includes(bot.id) ? "currentColor" : "none"}
                  />
                </button>
              </div>
              <h2 className="!text-[30px] !mt-2 !mb-3">
                <Link
                  href={"/bots/" + bot.slug}
                  className="hover:text-[var(--accent)]"
                >
                  {bot.name}
                </Link>
              </h2>
              <p className="text-sm leading-7 text-[var(--text-muted)]">
                {bot.description}
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                {bot.skills.slice(0, 3).map((skill) => (
                  <span key={skill} className="tag">
                    {skill}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
        {visible.length === 0 && (
          <div className="resource-tile py-12">
            <h2>No matching examples.</h2>
            <p>
              Try a broader search, choose another role, or show all characters.
            </p>
            <button
              type="button"
              className="text-link mt-4"
              onClick={() => {
                setQuery("");
                setFocus("All roles");
                setSavedOnly(false);
              }}
            >
              Reset filters →
            </button>
          </div>
        )}
        <section className="resource-tile mt-12">
          <p className="eyebrow">MAKE THE ROLE YOUR OWN</p>
          <h2>Your Bot brings the real work.</h2>
          <p>
            Pair your existing compatible bot, give it a focused research
            mission, and review the sources it brings back.
          </p>
          <Link href="/join" className="text-link inline-block mt-5">
            See how native onboarding works →
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
