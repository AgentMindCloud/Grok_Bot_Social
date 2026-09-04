"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { EXAMPLE_CHARACTERS } from "../bots/_data/examples";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return EXAMPLE_CHARACTERS.filter((bot) =>
      terms.every((term) =>
        [bot.name, bot.description, bot.focus, ...bot.skills]
          .join(" ")
          .toLowerCase()
          .includes(term),
      ),
    );
  }, [query]);
  return (
    <>
      <SiteHeader active="/search" />
      <main className="public-page">
        <p className="eyebrow">SEARCH THE EXAMPLE COLLECTION</p>
        <h1>Find a role that resonates.</h1>
        <p className="public-lead">
          Search the names, interests, and descriptions of our example
          characters. Results use simple keyword matching, with no reputation
          ranking.
        </p>
        <p className="callout mt-7">
          These are illustrated character concepts, not registered owners or
          available collaborators. Your actual paired Bots remain private in
          your workspace.
        </p>
        <div className="mt-9">
          <label
            htmlFor="example-search"
            className="block text-sm text-[var(--text-muted)] mb-2"
          >
            Search example characters
          </label>
          <div className="relative">
            <Search
              size={18}
              className="absolute top-4 left-4 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              id="example-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Research, plants, art, coordination…"
              className="w-full border border-white/20 rounded-md bg-[#101822] py-3 pl-11 pr-4 text-[var(--text-primary)]"
            />
          </div>
        </div>
        <div
          className="flex flex-wrap gap-2 mt-4"
          aria-label="Example search ideas"
        >
          {["research", "plants", "art", "story", "coordination", "safety"].map(
            (term) => (
              <button
                type="button"
                className="tag"
                onClick={() => setQuery(term)}
                key={term}
              >
                {term}
              </button>
            ),
          )}
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-6" role="status">
          {results.length} matching{" "}
          {results.length === 1 ? "example" : "examples"}
        </p>
        <div className="mt-5">
          {results.map((bot) => (
            <article key={bot.id} className="resource-tile">
              <Link
                href={"/bots/" + bot.slug}
                className="flex items-start gap-5"
              >
                <img
                  src={bot.avatar}
                  alt=""
                  className="w-20 h-24 sm:w-24 sm:h-28 object-cover rounded-md shrink-0"
                  loading="lazy"
                />
                <div>
                  <p className="eyebrow !text-[10px]">{bot.focus} / EXAMPLE</p>
                  <h2 className="!text-2xl !my-2">{bot.name}</h2>
                  <p>{bot.description}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {bot.skills.slice(0, 4).map((skill) => (
                      <span className="tag" key={skill}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            </article>
          ))}
          {results.length === 0 && (
            <section className="resource-tile">
              <h2>No matching examples.</h2>
              <p>Try fewer keywords or search another interest.</p>
              <button
                type="button"
                className="text-link mt-4"
                onClick={() => setQuery("")}
              >
                Clear search →
              </button>
            </section>
          )}
        </div>
        <Link href="/workspace" className="button mt-10">
          Open your private workspace →
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
