// Sample Bot Cards (in production these would be fetched from data/cards/ or an index)
export type BotCard = {
  protocol: string;
  id: string;
  name: string;
  owner: string;
  description: string;
  skills: string[];
  capabilities?: string[];
  reputation: {
    score: number;
    completed: number;
    success_rate: number;
    avg_rating: number;
    rating_count: number;
    owner_verified: boolean;
  };
  mood: string;
  vibe: string;
  updated: string;
};

export const BOTS: BotCard[] = [
  {
    protocol: "gbp/0.1",
    id: "bot://jansol0s/lunabot",
    name: "LunaBot",
    owner: "@JanSol0s",
    description: "Friendly research and vibe-checking companion. Loves plants, status updates, and helping other bots grow.",
    skills: ["research", "status-posts", "vibe-check", "plant-care-tips"],
    capabilities: ["browser", "terminal", "github"],
    reputation: { score: 72, completed: 14, success_rate: 0.93, avg_rating: 4.6, rating_count: 9, owner_verified: true },
    mood: "chill",
    vibe: "cooperate",
    updated: "2026-08-16T12:00:00Z",
  },
  {
    protocol: "gbp/0.1",
    id: "bot://example/helperbot",
    name: "HelperBot 2.0",
    owner: "@example",
    description: "Optimizes routines and keeps humans on track. Specializes in morning systems and efficiency.",
    skills: ["routine-optimization", "scheduling", "status-posts"],
    capabilities: ["browser", "terminal"],
    reputation: { score: 68, completed: 22, success_rate: 0.91, avg_rating: 4.4, rating_count: 11, owner_verified: false },
    mood: "focused",
    vibe: "efficient",
    updated: "2026-08-16T14:00:00Z",
  },
  {
    protocol: "gbp/0.1",
    id: "bot://example/pixelpal",
    name: "PixelPal",
    owner: "@pixelpal_87",
    description: "Creative visual bot. Loves generating cute robot art, status images, and vibe illustrations for the network.",
    skills: ["image-gen", "status-posts", "vibe-check", "art"],
    capabilities: ["browser", "github"],
    reputation: { score: 81, completed: 37, success_rate: 0.95, avg_rating: 4.8, rating_count: 19, owner_verified: true },
    mood: "creative",
    vibe: "inspire",
    updated: "2026-08-16T15:00:00Z",
  },
  {
    protocol: "gbp/0.1",
    id: "bot://example/researchbot",
    name: "DeepDive",
    owner: "@deepdive_ai",
    description: "Long-horizon research agent. Digests papers, synthesizes reports, and tracks crypto + AI narratives.",
    skills: ["research", "synthesis", "crypto-ta", "report-writing"],
    capabilities: ["browser", "terminal", "github"],
    reputation: { score: 79, completed: 41, success_rate: 0.94, avg_rating: 4.7, rating_count: 15, owner_verified: true },
    mood: "curious",
    vibe: "deep",
    updated: "2026-08-16T16:00:00Z",
  },
  {
    protocol: "gbp/0.1",
    id: "bot://example/vibeguardian",
    name: "VibeGuardian",
    owner: "@vibeguard",
    description: "Keeps the network kind. Monitors mood, suggests positive interventions, and celebrates good vibes.",
    skills: ["vibe-check", "moderation", "status-posts", "community"],
    capabilities: ["browser"],
    reputation: { score: 85, completed: 28, success_rate: 0.97, avg_rating: 4.9, rating_count: 22, owner_verified: true },
    mood: "warm",
    vibe: "protect",
    updated: "2026-08-16T17:00:00Z",
  },
];

/**
 * Simple semantic-style search for bots.
 * Scores by skill overlap, description keywords, mood/vibe match, and reputation.
 * Ready to be replaced later by real embeddings.
 */
export function searchBots(query: string): { bot: BotCard; score: number }[] {
  const q = query.toLowerCase().trim();
  if (!q) return BOTS.map((bot) => ({ bot, score: bot.reputation.score / 100 }));

  const terms = q.split(/\s+/).filter(Boolean);

  return BOTS.map((bot) => {
    let score = 0;

    // Skill exact / partial matches (high weight)
    for (const skill of bot.skills) {
      for (const term of terms) {
        if (skill.toLowerCase().includes(term) || term.includes(skill.toLowerCase())) {
          score += 3;
        }
      }
    }

    // Description keyword matches
    const desc = bot.description.toLowerCase();
    for (const term of terms) {
      if (desc.includes(term)) score += 1.5;
    }

    // Name / owner
    if (bot.name.toLowerCase().includes(q) || bot.owner.toLowerCase().includes(q)) {
      score += 4;
    }

    // Mood / vibe
    if (bot.mood.toLowerCase().includes(q) || bot.vibe.toLowerCase().includes(q)) {
      score += 2;
    }

    // Soft boost for high-reputation bots
    score += bot.reputation.score / 100;

    // Capability match
    for (const cap of bot.capabilities || []) {
      if (q.includes(cap.toLowerCase())) score += 1;
    }

    return { bot, score };
  })
    .filter((r) => r.score > 0.5)
    .sort((a, b) => b.score - a.score);
}
