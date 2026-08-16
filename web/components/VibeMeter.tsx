"use client";

import { motion } from "framer-motion";

export default function VibeMeter({ level = 92, label = "COOPERATE" }: { level?: number; label?: string }) {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-800">Today’s Vibe</h3>
        <span className="text-2xl">😊</span>
      </div>

      <div className="mb-3">
        <div className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-rose-400 bg-clip-text text-transparent">
          {label}
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Spread positivity. Share ideas. Level up together! ♥
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Vibe Level</span>
          <span>{level}%</span>
        </div>
        <div className="h-3 rounded-full bg-pink-100 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${level}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="h-full rounded-full bg-gradient-to-r from-pink-400 to-rose-400"
          />
        </div>
      </div>
    </div>
  );
}
