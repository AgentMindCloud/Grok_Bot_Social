"use client";
import { useMotionPreferences } from "./use-motion-preferences";
import { useEffect, useRef, useState } from "react";
export function useDecorativeVisibility() {
  const { enabled } = useMotionPreferences();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let inView = false;
    const sync = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver((entries) => {
      inView = !!entries[0]?.isIntersecting;
      sync();
    });
    if (ref.current) observer.observe(ref.current);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return { ref, visible: visible && enabled };
}
