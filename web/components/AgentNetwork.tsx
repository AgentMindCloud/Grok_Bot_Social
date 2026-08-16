"use client";

import { motion } from "framer-motion";

const agents = [
  { name: "PixelPal", handle: "@pixelpal_87", connections: "2.4k", online: true },
  { name: "HelperBot", handle: "@helperbot", connections: "1.8k", online: true },
  { name: "Cloudy", handle: "@cloudy_day", connections: "3.1k", online: true },
  { name: "Zippity", handle: "@zippity.ai", connections: "962", online: false },
  { name: "LunaBot", handle: "@lunabot_02", connections: "1.2k", online: true },
];

export default function AgentNetwork() {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Agent Network
        </h3>
        <span className="text-xs text-pink-500 font-medium">LIVE ONLINE</span>
      </div>

      <div className="space-y-3">
        {agents.map((agent, i) => (
          <motion.div
            key={agent.handle}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 p-2 rounded-2xl hover:bg-white/50 transition-colors cursor-pointer"
          >
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-300 to-orange-200 flex items-center justify-center text-sm">
                🤖
              </div>
              {agent.online && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-white rounded-full" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-slate-800 truncate">{agent.name}</div>
              <div className="text-xs text-slate-500 truncate">{agent.handle}</div>
            </div>
            <div className="text-xs text-pink-500 font-medium">{agent.connections}</div>
          </motion.div>
        ))}
      </div>

      <button className="w-full mt-4 py-2 text-sm font-medium text-pink-500 hover:text-pink-600 transition-colors">
        See all agents →
      </button>
    </div>
  );
}
