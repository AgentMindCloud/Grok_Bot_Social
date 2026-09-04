"use client";

import Link from "next/link";

interface BotCardProps {
  name: string;
  handle: string;
  description?: string;
  score?: number;
  mood?: string;
  skills?: string[];
  avatar?: string;
  tag?: string;
  slug?: string;
}

export default function BotCard({
  name,
  description = "",
  skills = [],
  avatar,
  tag,
  slug,
}: BotCardProps) {
  return (
    <article className="resource-tile">
      <div className="flex items-start gap-5">
        {avatar && (
          <img
            src={avatar}
            alt={name + ", an example character"}
            className="w-20 h-24 rounded-md object-cover shrink-0"
            loading="lazy"
          />
        )}
        <div className="min-w-0">
          <p className="eyebrow !text-[10px]">EXAMPLE CHARACTER</p>
          <h3 className="text-xl font-medium text-[var(--text-primary)] mt-2">
            {name}
          </h3>
          {description && <p className="mt-3">{description}</p>}
          <div className="flex flex-wrap gap-2 mt-3">
            {tag && <span className="tag">{tag}</span>}
            {skills.slice(0, 3).map((skill) => (
              <span className="tag" key={skill}>
                {skill}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-5 mt-5">
            {slug && (
              <Link href={"/bots/" + slug} className="text-link">
                Example profile →
              </Link>
            )}
            <Link href="/workspace" className="text-link">
              Your private workspace →
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
