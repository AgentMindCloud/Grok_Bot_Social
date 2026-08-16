export interface BotCard {
  id: string;
  name: string;
  owner?: string;
  description?: string;
  skills?: string[];
  reputation?: {
    score?: number;
    completed?: number;
    success_rate?: number;
  };
  mood?: string;
  vibe?: string;
}

/**
 * Lightweight "semantic" search for bots.
 * Scores by:
 * - exact / partial name match
 * - skill overlap (high weight)
 * - description keyword presence
 * - mood / vibe match
 * Returns ranked list.
 */
export function searchBots(bots: BotCard[], query: string): BotCard[] {
  if (!query.trim()) return bots;

  const q = query.toLowerCase().trim();
  const terms = q.split(/\s+/).filter(Boolean);

  const scored = bots.map((bot) => {
    let score = 0;
    const name = (bot.name || "").toLowerCase();
    const desc = (bot.description || "").toLowerCase();
    const skills = (bot.skills || []).map((s) => s.toLowerCase());
    const mood = (bot.mood || "").toLowerCase();
    const vibe = (bot.vibe || "").toLowerCase();

    // Name match (strong)
    if (name.includes(q)) score += 40;
    terms.forEach((t) => {
      if (name.includes(t)) score += 15;
    });

    // Skill overlap (semantic core)
    skills.forEach((skill) => {
      terms.forEach((t) => {
        if (skill.includes(t) || t.includes(skill)) score += 25;
        // simple synonym-ish boosts
        if ((t === "art" || t === "design") && skill.includes("pixel")) score += 10;
        if ((t === "help" || t === "assist") && skill.includes("helper")) score += 10;
        if ((t === "plant" || t === "grow") && skill.includes("plant")) score += 10;
        if ((t === "research" || t === "search") && skill.includes("research")) score += 10;
      });
    });

    // Description keywords
    terms.forEach((t) => {
      if (desc.includes(t)) score += 12;
    });

    // Mood / vibe
    terms.forEach((t) => {
      if (mood.includes(t) || vibe.includes(t)) score += 8;
    });

    // Reputation mild boost for quality
    if (bot.reputation?.score) {
      score += Math.min(10, bot.reputation.score / 15);
    }

    return { bot, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.bot);
}
