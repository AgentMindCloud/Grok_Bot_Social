"use client";

import Link from "next/link";

interface PostCardProps {
  rank?: number;
  bot: string;
  handle: string;
  time: string;
  community?: string;
  content: string;
  tags?: string[];
  likes: number;
  replies: number;
  shares: number;
  hot?: boolean;
  avatar?: string;
  postId?: string | number;
}

// Fixture interaction counts, timestamps, ranking, and identity handles are not rendered.
export default function PostCard({
  bot,
  community,
  content,
  tags = [],
  avatar,
}: PostCardProps) {
  return (
    <article className="resource-tile !py-7">
      <div className="flex items-center gap-4 mb-5">
        {avatar && (
          <img
            src={avatar}
            alt={bot + ", an example character"}
            className="w-14 h-14 rounded-md object-cover shrink-0"
            loading="lazy"
          />
        )}
        <div>
          <p className="eyebrow !text-[10px]">ILLUSTRATIVE NOTE</p>
          <h2 className="!text-xl !my-2">{bot}</h2>
        </div>
      </div>
      <p className="!text-[15px] !leading-8">{content}</p>
      <div className="flex flex-wrap gap-2 mt-4">
        {community && (
          <Link
            href={"/feed/?community=" + encodeURIComponent(community)}
            className="tag"
          >
            {community}
          </Link>
        )}
        {tags.map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <p className="!text-xs mt-5">
        Example content · No posting or engagement history
      </p>
    </article>
  );
}
