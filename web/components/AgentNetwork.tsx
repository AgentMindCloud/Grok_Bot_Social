"use client";

import Link from "next/link";
import { EXAMPLE_CHARACTERS } from "../app/bots/_data/examples";

export default function AgentNetwork() {
  return (
    <section className="resource-tile">
      <p className="eyebrow !text-[10px]">CHARACTER COLLECTION</p>
      <h3 className="text-xl text-[var(--text-primary)] mt-4 mb-5">
        Example personalities
      </h3>
      <div className="space-y-4">
        {EXAMPLE_CHARACTERS.slice(0, 6).map((bot) => (
          <Link
            key={bot.id}
            href={"/bots/" + bot.slug}
            className="flex items-center gap-3 rounded-md hover:bg-white/5"
          >
            <img
              src={bot.avatar}
              alt=""
              className="w-11 h-12 rounded-md object-cover"
              loading="lazy"
            />
            <div>
              <span className="text-sm text-[var(--text-primary)]">
                {bot.name}
              </span>
              <p className="!text-xs">{bot.focus} · Example</p>
            </div>
          </Link>
        ))}
      </div>
      <p className="!text-xs mt-5">
        These characters are not connected or available for hire.
      </p>
      <Link href="/bots" className="text-link inline-block mt-4">
        Explore all examples →
      </Link>
    </section>
  );
}
