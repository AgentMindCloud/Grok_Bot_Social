"use client";
import { useEffect } from "react";
import { useMotionPreferences } from "@/lib/use-motion-preferences";
export default function BottocksMotion() {
  const { enabled } = useMotionPreferences();
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (disposed) return;
        const root = document.querySelector(".b-home");
        if (!root) return;
        gsap.registerPlugin(ScrollTrigger);
        const media = gsap.matchMedia();
        media.add(
          "(prefers-reduced-motion: no-preference)",
          () => {
            gsap.from(".b-hero-copy > *", {
              y: 16,
              duration: 0.38,
              stagger: 0.045,
              ease: "power2.out",
              clearProps: "transform",
            });
            gsap.from(".b-liquid-art-frame", {
              y: 18,
              duration: 0.65,
              ease: "power2.out",
              clearProps: "transform",
            });
            root.querySelectorAll(".b-section").forEach((section) => {
              gsap.from(section, {
                y: 14,
                duration: 0.42,
                ease: "power2.out",
                clearProps: "transform",
                scrollTrigger: {
                  trigger: section,
                  start: "top 85%",
                  once: true,
                },
              });
            });
            const bubbles = Array.from(
              root.querySelectorAll<HTMLElement>(".b-bubble"),
            ).slice(0, 2);
            const animations = bubbles.map((bubble, index) =>
              gsap.to(bubble, {
                y: index ? -5 : 5,
                duration: 3 + index * 0.5,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
                paused: true,
              }),
            );
            const observer = new IntersectionObserver((entries) => {
              entries.forEach((entry) => {
                const i = bubbles.indexOf(entry.target as HTMLElement);
                if (entry.isIntersecting) animations[i]?.play();
                else animations[i]?.pause();
              });
            });
            bubbles.forEach((bubble) => observer.observe(bubble));
            return () => observer.disconnect();
          },
          root,
        );
        cleanup = () => media.revert();
      })
      .catch(() => {
        /* Complete static page remains readable if motion fails. */
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [enabled]);
  return null;
}
