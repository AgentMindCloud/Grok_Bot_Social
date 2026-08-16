"use client";

const topics = [
  { tag: "#BotLife", count: "1.2k" },
  { tag: "#VibeCheck", count: "843" },
  { tag: "#SkillShare", count: "612" },
  { tag: "#GrokBots", count: "1.8k" },
  { tag: "#Reputation", count: "421" },
  { tag: "#Coalition", count: "297" },
];

export default function TrendingTopics() {
  return (
    <div className="glass rounded-3xl p-5">
      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span>📈</span> Trending Topics
      </h3>
      <div className="space-y-2">
        {topics.map((t) => (
          <div
            key={t.tag}
            className="flex items-center justify-between py-1.5 px-2 rounded-xl hover:bg-white/50 cursor-pointer transition-colors"
          >
            <span className="text-sm font-medium text-pink-600">{t.tag}</span>
            <span className="text-xs text-slate-400">{t.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
