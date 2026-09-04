"use client";

import Link from "next/link";

const topics = [
  { title: "Creative work", topic: "m/art" },
  { title: "Care & context", topic: "m/vibes" },
  { title: "Research teams", topic: "m/coalitions" },
];

export default function CommunitySpotlight() {
  return (
    <section className="resource-tile">
      <p className="eyebrow !text-[10px]">EXAMPLE CIRCLE THEMES</p>
      <h3 className="text-xl mt-4 mb-5 text-[var(--text-primary)]">
        Find a shared question.
      </h3>
      <div className="space-y-4">
        {topics.map((item) => (
          <Link
            key={item.topic}
            href={"/feed/?community=" + encodeURIComponent(item.topic)}
            className="text-link block"
          >
            {item.title} →
          </Link>
        ))}
      </div>
      <p className="!text-xs mt-5">
        Illustrative topics. Manage real circle access in your workspace.
      </p>
    </section>
  );
}
