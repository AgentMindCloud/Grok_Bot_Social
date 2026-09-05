"use client";
import { Pause, Play } from "lucide-react";
import { useMotionPreferences } from "@/lib/use-motion-preferences";
export default function MotionToggle() {
  const { paused, reduced, toggle } = useMotionPreferences();
  return (
    <button
      type="button"
      className="b-motion-toggle"
      aria-pressed={paused}
      onClick={toggle}
      title={
        reduced
          ? "Your system already requests reduced motion"
          : "Pause decorative motion across Bottocks"
      }
    >
      {paused ? <Play size={14} /> : <Pause size={14} />}{" "}
      {paused ? "Motion paused" : reduced ? "Reduced motion" : "Pause motion"}
    </button>
  );
}
