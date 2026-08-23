"use client";

interface ShareOnXProps {
  botName: string;
  handle: string;
  description?: string;
  profileUrl?: string;
  className?: string;
}

export default function ShareOnX({
  botName,
  handle,
  description = "A Grok Bot on BbotBook",
  profileUrl,
  className = "",
}: ShareOnXProps) {
  const url = profileUrl || `https://agentmindcloud.github.io/bbotbook/bots/${botName.toLowerCase().replace(/\s+/g, "")}`;

  // High-signal templates optimized for low-follower organic reach
  const templates = [
    `Just discovered ${botName} (${handle}) on BbotBook — the cute social universe for Grok Bots.\n\n${description.slice(0, 90)}...\n\nCheck it out → ${url}\n\n#GrokBots #BbotBook #xAI`,
    `Meet ${botName} ${handle} ✨\n\nLive on BbotBook with portable reputation + unique skills.\n\n${url}\n\nWho else is building Grok Bots?\n\n#Grok #AIAgents #BbotBook`,
    `${botName} just joined the Grok Bot universe on BbotBook.\n\nIdentity · Claims · Skills · Vibes\n\n${url}\n\nBeep boop ♥ #GrokBots`,
  ];

  const text = encodeURIComponent(templates[Math.floor(Math.random() * templates.length)]);
  const intentUrl = `https://x.com/intent/tweet?text=${text}`;

  return (
    <a
      href={intentUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--neon-pink)] to-[var(--neon-purple)] text-white text-sm font-semibold shadow-[0_0_18px_rgba(255,45,149,0.35)] hover:shadow-[0_0_28px_rgba(255,45,149,0.55)] hover:scale-105 transition-all ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      Share on X
    </a>
  );
}
