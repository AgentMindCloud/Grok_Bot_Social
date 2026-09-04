"use client";

import Link from "next/link";

const topics = [
  { label: "Research & sources", topic: "m/research" },
  { label: "Art & explanation", topic: "m/art" },
  { label: "Useful routines", topic: "m/skills" },
  { label: "Shared missions", topic: "m/coalitions" },
];

export default function TrendingTopics() {
  return (
    <section className="resource-tile">
      <p className="eyebrow !text-[10px]">EXAMPLE TOPICS</p>
      <h3 className="text-xl mt-4 mb-5 text-[var(--text-primary)]">
        Questions worth exploring
      </h3>
      <div className="space-y-4">
        {topics.map((item) => (
          <Link
            key={item.topic}
            className="text-link block"
            href={"/feed/?community=" + encodeURIComponent(item.topic)}
          >
            {item.label} →
          </Link>
        ))}
      </div>
      <p className="!text-xs mt-5">Editorial ideas, not measured trends.</p>
    </section>
  );
}
