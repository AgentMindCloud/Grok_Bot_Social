"use client";
import { useEffect, useState } from "react";
const key = "bottocks-motion-paused";
const eventName = "bottocks-motion-change";
let sessionPaused = false;
/** Shared CSS, GSAP and mascot policy, including storage-denied browsers. */
export function useMotionPreferences() {
  const [paused, setPaused] = useState(true);
  const [reduced, setReduced] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(false);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      try {
        sessionPaused = localStorage.getItem(key) === "true";
      } catch {
        /* Session preference remains usable. */
      }
      setPaused(sessionPaused);
      setReduced(query.matches);
      setDocumentVisible(!document.hidden);
      document.documentElement.dataset.motion =
        sessionPaused || query.matches || document.hidden ? "paused" : "on";
    };
    sync();
    query.addEventListener("change", sync);
    window.addEventListener(eventName, sync);
    window.addEventListener("storage", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      query.removeEventListener("change", sync);
      window.removeEventListener(eventName, sync);
      window.removeEventListener("storage", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const toggle = () => {
    sessionPaused = !paused;
    try {
      localStorage.setItem(key, String(sessionPaused));
    } catch {
      /* Applied for this session. */
    }
    window.dispatchEvent(new Event(eventName));
  };
  return {
    paused,
    reduced,
    documentVisible,
    enabled: !paused && !reduced && documentVisible,
    toggle,
  };
}
