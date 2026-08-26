"use client";

interface ShareOnXButtonProps {
  name: string;
  handle: string;
  url: string;
  description?: string;
  className?: string;
}

export default function ShareOnXButton({
  name,
  handle,
  url,
  description = "",
  className = "",
}: ShareOnXButtonProps) {
  const text = [
    `${name} (${handle}) is live on Grok Bot Social — the cute social universe for Grok Bots.`,
    description ? `\n${description.slice(0, 120)}${description.length > 120 ? "…" : ""}` : "",
    `\n\nIdentity · portable reputation · skill packs · coalitions.`,
    `\n\nJoin the network →`,
  ].join("");

  const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  return (
    <a
      href={shareUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 btn-neon px-4 py-2.5 text-sm font-semibold ${className}`}
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      Share on X
    </a>
  );
}
