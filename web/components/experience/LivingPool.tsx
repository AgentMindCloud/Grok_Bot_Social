"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  Droplets,
  Gauge,
  RotateCcw,
  Sparkles,
  Waves,
} from "lucide-react";
import { useMotionPreferences } from "@/lib/use-motion-preferences";
import "./living-pool.css";

type SwimmerId = "byte" | "glitch" | "mochi";
type PoolMode = "chill" | "race";
type Ripple = { id: number; x: number; y: number };

const swimmers: {
  id: SwimmerId;
  name: string;
  color: string;
  dark: string;
  light: string;
  line: string;
  role: string;
}[] = [
  {
    id: "byte",
    name: "Byte",
    color: "#06baff",
    dark: "#1760ba",
    light: "#dbfbff",
    line: "Excellent ideas. Questionable swimming technique.",
    role: "Professional splash maker",
  },
  {
    id: "glitch",
    name: "Glitch",
    color: "#ff388e",
    dark: "#a21d71",
    light: "#ffd8f3",
    line: "The shades stay on. Even underwater.",
    role: "Poolside style department",
  },
  {
    id: "mochi",
    name: "Mochi",
    color: "#a797ff",
    dark: "#5442ae",
    light: "#ebe8ff",
    line: "Calculating the shortest route to doing absolutely nothing.",
    role: "Chief floating officer",
  },
];

function RobotSwimmer({
  character,
  compact = false,
}: {
  character: (typeof swimmers)[number];
  compact?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const isPip = character.id === "byte";
  return (
    <svg
      className={`lp-robot lp-robot-${character.id}${compact ? " lp-robot-compact" : ""}`}
      viewBox="0 0 180 210"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`${uid}-shell`}
          x1="40"
          y1="22"
          x2="148"
          y2="164"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={isPip ? "#fff" : character.light} />
          <stop offset=".42" stopColor={isPip ? "#f2f8ff" : character.color} />
          <stop offset=".8" stopColor={isPip ? "#bbd2e3" : character.dark} />
          <stop offset="1" stopColor={character.color} />
        </linearGradient>
        <linearGradient
          id={`${uid}-edge`}
          x1="24"
          y1="30"
          x2="158"
          y2="115"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={character.light} />
          <stop offset=".3" stopColor={character.color} />
          <stop offset="1" stopColor={character.dark} />
        </linearGradient>
        <linearGradient
          id={`${uid}-face`}
          x1="48"
          y1="39"
          x2="132"
          y2="111"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#334363" />
          <stop offset=".42" stopColor="#0d152a" />
          <stop offset="1" stopColor="#020719" />
        </linearGradient>
        <linearGradient
          id={`${uid}-glass`}
          x1="44"
          y1="48"
          x2="139"
          y2="92"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#94e8ff" />
          <stop offset=".2" stopColor="#1954b6" />
          <stop offset=".48" stopColor="#091445" />
          <stop offset=".55" stopColor="#61bdff" />
          <stop offset=".7" stopColor="#173779" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`}>
          <stop stopColor="#00d9ff" stopOpacity=".35" />
          <stop offset="1" stopColor="#00d9ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="92" cy="173" rx="60" ry="22" fill="#06547b" opacity=".22" />
      <g className="lp-stroke lp-stroke-left">
        <path
          d="M65 140Q34 137 23 157Q13 174 28 180Q47 174 61 162"
          fill={`url(#${uid}-shell)`}
          stroke="#102b50"
          strokeWidth="3"
        />
        <path d="M24 155l12 11" stroke={character.color} strokeWidth="10" />
        <ellipse
          cx="27"
          cy="177"
          rx="15"
          ry="10"
          transform="rotate(-24 27 177)"
          fill={`url(#${uid}-edge)`}
          stroke="#102b50"
          strokeWidth="2"
        />
        <path
          d="M19 175l11-5"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          opacity=".8"
        />
      </g>
      <g className="lp-stroke lp-stroke-right">
        <path
          d="M117 140Q148 134 158 155Q168 173 155 179Q138 173 123 161"
          fill={`url(#${uid}-shell)`}
          stroke="#102b50"
          strokeWidth="3"
        />
        <path d="M157 154l-12 12" stroke={character.color} strokeWidth="10" />
        <ellipse
          cx="155"
          cy="177"
          rx="15"
          ry="10"
          transform="rotate(24 155 177)"
          fill={`url(#${uid}-edge)`}
          stroke="#102b50"
          strokeWidth="2"
        />
        <path
          d="M149 171l12 5"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          opacity=".8"
        />
      </g>
      <path
        d="M60 132Q88 119 121 134L132 170Q90 190 49 170Z"
        fill={`url(#${uid}-shell)`}
        stroke="#102b50"
        strokeWidth="3"
      />
      <path
        d="M71 137L91 151L109 138"
        stroke={character.color}
        strokeWidth="12"
        strokeLinejoin="round"
      />
      <path d="M87 155c-8-10-16 0 0 11c16-11 8-21 0-11" fill="#ff63aa" />
      <ellipse cx="90" cy="178" rx="49" ry="10" fill="#41dcff" opacity=".56" />
      <g className="lp-robot-head">
        {character.id !== "mochi" && (
          <>
            <path
              d="M45 43L35 7Q31-3 26 7L22 55"
              fill={`url(#${uid}-shell)`}
              stroke="#102b50"
              strokeWidth="3"
            />
            <path d="M31 14l9 32-12-4Z" fill={`url(#${uid}-edge)`} />
            <path
              d="M126 37l19-31q6-7 8 2l1 45"
              fill={`url(#${uid}-shell)`}
              stroke="#102b50"
              strokeWidth="3"
            />
            <path d="M145 16l-13 29 16-4Z" fill={`url(#${uid}-edge)`} />
          </>
        )}
        {character.id === "mochi" && (
          <>
            <path d="M139 41l18-21" stroke="#444383" strokeWidth="5" />
            <circle
              cx="159"
              cy="17"
              r="9"
              fill="#ffcf28"
              stroke="#b78610"
              strokeWidth="2"
            />
            <circle cx="157" cy="14" r="3" fill="#fff6ad" />
          </>
        )}
        <ellipse
          cx="32"
          cy="78"
          rx="14"
          ry="26"
          fill={`url(#${uid}-edge)`}
          stroke="#102b50"
          strokeWidth="3"
        />
        <ellipse
          cx="148"
          cy="78"
          rx="14"
          ry="26"
          fill={`url(#${uid}-edge)`}
          stroke="#102b50"
          strokeWidth="3"
        />
        <ellipse
          cx="150"
          cy="79"
          rx="7"
          ry="18"
          fill="#172544"
          stroke="#c9f4ff"
          strokeWidth="2"
        />
        <path
          d="M91 24C132 24 148 39 148 77C148 111 131 131 90 132C48 131 32 111 32 77C32 42 48 24 91 24Z"
          fill={`url(#${uid}-shell)`}
          stroke="#132945"
          strokeWidth="3"
        />
        <path
          d="M90 34C124 34 138 46 138 77C138 105 124 120 90 121C56 120 42 107 42 78C42 48 56 34 90 34Z"
          fill={`url(#${uid}-face)`}
          stroke={isPip ? "#fcffff" : character.light}
          strokeWidth="3"
        />
        <ellipse cx="90" cy="84" rx="50" ry="34" fill={`url(#${uid}-glow)`} />
        <path
          d="M52 53q6-11 16-10"
          stroke="white"
          strokeWidth="5"
          strokeLinecap="round"
          opacity=".8"
        />
        <ellipse
          cx="117"
          cy="45"
          rx="8"
          ry="3"
          transform="rotate(21 117 45)"
          fill="white"
          opacity=".35"
        />
        {character.id === "glitch" ? (
          <>
            <path
              d="M45 66L85 69L79 89Q53 93 47 77ZM96 69L137 64L132 82Q122 94 102 86Z"
              fill={`url(#${uid}-glass)`}
              stroke="#a8deff"
              strokeWidth="2"
            />
            <path d="M83 73q7-6 14 0" stroke="#afdeff" strokeWidth="4" />
            <path d="M49 71l-9-3M136 69l8-3" stroke="#152047" strokeWidth="5" />
          </>
        ) : character.id === "mochi" ? (
          <>
            <path
              d="M61 80q0-20 13-20q10 0 7 20M103 80q0-20 12-20q11 0 9 20"
              stroke="#07dfff"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d="M48 34q4-19 29-17l12 8 12-8q27-2 33 17l-6 13-31-2-8-9-10 9-26-1Z"
              fill="#ffdc28"
              stroke="#a17f13"
              strokeWidth="3"
            />
            <path
              d="M57 31q14-10 23 0l-5 8-17-1ZM100 29q14-11 26 3l-3 7-19-2Z"
              fill={`url(#${uid}-glass)`}
              stroke="#fff6a8"
              strokeWidth="2"
            />
          </>
        ) : (
          <>
            <ellipse
              cx="66"
              cy="76"
              rx="8"
              ry="15"
              stroke="#0ee2ff"
              strokeWidth="6"
            />
            <path
              d="M115 65L102 77l16 6"
              stroke="#0ee2ff"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        <path
          d="M78 96q4 4 9 0q6 6 11 0q2 16-11 16q-10-1-9-16"
          fill={character.id === "glitch" ? "#ff63aa" : "#06d8fb"}
        />
        <path
          d="M52 94l1 3M59 94l1 3M123 94l-1 3M129 93l-1 3"
          stroke="#00e0ff"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M78 29h20"
          stroke={character.color}
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M33 180q17 11 37 4M112 184q24 9 42-6"
        stroke="#e5ffff"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".85"
      />
    </svg>
  );
}

function Duck({ index }: { index: number }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 90 80" className="lp-duck-art" aria-hidden="true">
      <defs>
        <linearGradient id={uid} x1="20%" y1="0" x2="70%" y2="100%">
          <stop stopColor="#fffbaa" />
          <stop offset=".4" stopColor="#ffdf24" />
          <stop offset="1" stopColor="#f49d08" />
        </linearGradient>
      </defs>
      <ellipse cx="46" cy="69" rx="34" ry="7" fill="#063e69" opacity=".25" />
      <path
        d="M21 47Q17 30 32 20Q49 13 57 25Q64 35 54 45Q73 53 79 41Q91 72 49 72Q9 72 11 53Z"
        fill={`url(#${uid})`}
        stroke="#df8a00"
        strokeWidth="2"
      />
      <path
        d="M24 33L9 38Q5 43 14 46L28 44"
        fill="#ff8220"
        stroke="#d35606"
        strokeWidth="2"
      />
      <ellipse cx="42" cy="31" rx="4" ry="6" fill="#182535" />
      <circle cx="43" cy="29" r="1.5" fill="white" />
      <path
        d="M45 53Q56 48 62 57Q53 65 42 60"
        fill="#ffc814"
        stroke="#eaae0b"
        strokeWidth="2"
      />
      <path
        d="M31 23q9-5 15-1"
        fill="none"
        stroke="#fffab8"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <text x="50" y="62" fontSize="0">
        {index}
      </text>
    </svg>
  );
}

function PoolArtwork() {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      className="lp-pool-art"
      viewBox="0 60 1000 560"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`${uid}-wall`}
          x1="500"
          y1="300"
          x2="500"
          y2="609"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#bdffff" />
          <stop offset=".2" stopColor="#13cded" />
          <stop offset=".58" stopColor="#0686bb" />
          <stop offset=".91" stopColor="#0c3b86" />
          <stop offset="1" stopColor="#51dcff" />
        </linearGradient>
        <linearGradient
          id={`${uid}-rim`}
          x1="126"
          y1="112"
          x2="804"
          y2="586"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ebffff" />
          <stop offset=".17" stopColor="#69edff" />
          <stop offset=".39" stopColor="#12a2d9" />
          <stop offset=".62" stopColor="#d3ffff" />
          <stop offset=".82" stopColor="#29cde9" />
          <stop offset="1" stopColor="#046baf" />
        </linearGradient>
        <radialGradient id={`${uid}-water`} cx=".38" cy=".2" r=".9">
          <stop stopColor="#63f7f0" />
          <stop offset=".36" stopColor="#09bdde" />
          <stop offset=".74" stopColor="#077cbc" />
          <stop offset="1" stopColor="#074c9c" />
        </radialGradient>
        <radialGradient id={`${uid}-shadow`}>
          <stop stopColor="#08317b" stopOpacity=".35" />
          <stop offset="1" stopColor="#022263" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-ladder`}>
          <stop stopColor="#194c86" />
          <stop offset=".33" stopColor="#cffbff" />
          <stop offset=".6" stopColor="#fff" />
          <stop offset="1" stopColor="#348fc1" />
        </linearGradient>
        <pattern
          id={`${uid}-tile`}
          width="54"
          height="35"
          patternUnits="userSpaceOnUse"
          patternTransform="skewX(-13)"
        >
          <path
            d="M0 0H54V35H0Z"
            stroke="#006faf"
            strokeWidth="1"
            opacity=".18"
          />
          <path d="M1 1H53V34" stroke="#bcffff" strokeWidth="1" opacity=".24" />
        </pattern>
        <pattern
          id={`${uid}-caustic`}
          width="230"
          height="160"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M-20 50Q10 15 55 27T117 17Q148 2 174 42T246 54M6 162Q30 127 11 92T55 27M57 170Q103 148 95 106T117 17M174 42Q151 89 187 116T244 148M11 92Q42 72 95 106T187 116"
            stroke="#c4ffff"
            strokeWidth="2.5"
            opacity=".5"
          />
          <path
            d="M-20 55Q10 20 55 32T117 22Q148 7 174 47T246 59M11 97Q42 77 95 111T187 121"
            stroke="#fff"
            strokeWidth="1"
            opacity=".25"
          />
        </pattern>
        <clipPath id={`${uid}-water-clip`}>
          <ellipse cx="500" cy="324" rx="414" ry="174" />
        </clipPath>
      </defs>
      <ellipse
        cx="500"
        cy="562"
        rx="492"
        ry="79"
        fill={`url(#${uid}-shadow)`}
      />
      <path
        d="M34 330C34 208 242 109 500 109S966 208 966 330V376C966 499 758 598 500 598S34 499 34 376Z"
        fill={`url(#${uid}-wall)`}
        stroke="#5fe8ff"
        strokeWidth="2"
      />
      <path
        d="M42 378C61 492 258 582 500 582S938 493 958 379"
        stroke="#aafcff"
        strokeWidth="3"
        opacity=".6"
      />
      <path
        d="M61 416Q134 547 386 570M624 570Q876 546 937 419"
        stroke="#19a4e6"
        strokeWidth="10"
        opacity=".45"
      />
      {[160, 290, 435, 580, 725, 845].map((x) => (
        <path
          key={x}
          d={`M${x} 418v115`}
          stroke="#72e8ff"
          strokeWidth="2"
          opacity=".12"
        />
      ))}
      <ellipse
        cx="500"
        cy="329"
        rx="466"
        ry="220"
        fill={`url(#${uid}-rim)`}
        stroke="#bdfcff"
        strokeWidth="3"
      />
      <ellipse
        cx="500"
        cy="326"
        rx="438"
        ry="194"
        stroke="#e1ffff"
        strokeWidth="2"
        opacity=".85"
      />
      <ellipse cx="500" cy="326" rx="421" ry="179" fill="#043c7a" />
      <ellipse
        cx="500"
        cy="324"
        rx="414"
        ry="174"
        fill={`url(#${uid}-water)`}
      />
      <g clipPath={`url(#${uid}-water-clip)`}>
        <rect
          x="65"
          y="115"
          width="880"
          height="440"
          fill={`url(#${uid}-tile)`}
        />
        <g className="lp-caustic">
          <rect
            x="-160"
            y="70"
            width="1300"
            height="550"
            fill={`url(#${uid}-caustic)`}
          />
        </g>
        <g className="lp-caustic lp-caustic-second">
          <rect
            x="-160"
            y="70"
            width="1300"
            height="550"
            fill={`url(#${uid}-caustic)`}
            opacity=".35"
          />
        </g>
        <ellipse
          cx="497"
          cy="263"
          rx="373"
          ry="148"
          stroke="#fff"
          strokeWidth="4"
          opacity=".13"
        />
        <ellipse
          className="lp-water-ring"
          cx="508"
          cy="330"
          rx="315"
          ry="115"
          stroke="#c9ffff"
          strokeWidth="1.5"
          opacity=".35"
        />
        <ellipse
          className="lp-water-ring lp-water-ring-second"
          cx="486"
          cy="330"
          rx="274"
          ry="92"
          stroke="#c9ffff"
          strokeWidth="1.5"
          opacity=".22"
        />
        <path
          d="M126 258Q173 182 348 167"
          stroke="#f0ffff"
          strokeWidth="8"
          strokeLinecap="round"
          opacity=".25"
        />
      </g>
      <path
        d="M61 295C92 192 279 126 500 126C621 126 738 147 818 183"
        stroke="white"
        strokeWidth="6"
        strokeLinecap="round"
        opacity=".7"
      />
      <path
        d="M129 455C211 505 349 535 500 535C691 535 849 486 923 413"
        stroke="#e5ffff"
        strokeWidth="6"
        strokeLinecap="round"
        opacity=".85"
      />
      <path
        d="M190 490Q322 536 468 537"
        stroke="white"
        strokeWidth="11"
        strokeLinecap="round"
        opacity=".65"
      />
      <path
        d="M854 417l31-44q9-16 21-10q10 6 0 24l-20 30M815 398l31-44q9-16 21-10q10 6 0 24l-20 30"
        stroke="#053c6d"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M854 417l31-44q9-16 21-10q10 6 0 24l-20 30M815 398l31-44q9-16 21-10q10 6 0 24l-20 30M831 378l40 19M841 364l40 19"
        stroke={`url(#${uid}-ladder)`}
        strokeWidth="8"
        strokeLinecap="round"
      />
      <g transform="translate(173 175) rotate(-18)">
        <ellipse
          rx="47"
          ry="24"
          fill="#003f7d"
          opacity=".18"
          transform="translate(0 17)"
        />
        <ellipse
          rx="42"
          ry="28"
          fill="#ff7cbb"
          stroke="#ffdaf2"
          strokeWidth="4"
        />
        <ellipse
          rx="22"
          ry="12"
          fill="#139ac4"
          stroke="#d83a94"
          strokeWidth="7"
        />
        <path
          d="M-32-10Q-22-22-7-23"
          stroke="white"
          strokeWidth="5"
          strokeLinecap="round"
          opacity=".85"
        />
      </g>
      <g fill="white">
        <path
          className="lp-glint"
          d="M853 221l4 13 14 4-14 4-4 13-4-13-13-4 13-4Z"
        />
        <path
          className="lp-glint lp-glint-second"
          d="M283 500l3 10 10 3-10 3-3 10-3-10-10-3 10-3Z"
        />
      </g>
    </svg>
  );
}

function paintSwimmers(
  nodes: (HTMLDivElement | null)[],
  elapsed: number,
  geometry: { width: number; height: number },
) {
  const seconds = elapsed / 1000;
  nodes.forEach((node, index) => {
    if (!node) return;
    // Fixed phase gaps prevent swimmers catching and piling up on each other.
    const theta = seconds * 0.22 + 0.35 + index * ((Math.PI * 2) / 3);
    const x = 50 + Math.cos(theta) * [29, 28, 30][index];
    const y = 43 + Math.sin(theta) * [18, 19, 17][index];
    const lean = Math.cos(theta + 0.4) * 7;
    const dx = ((x - [77, 29, 45][index]) * geometry.width) / 100;
    const dy = ((y - [49, 55, 26][index]) * geometry.height) / 100;
    node.style.transform = `translate(-50%, -50%) translate3d(${dx}px, ${dy}px, 0) rotate(${lean}deg)`;
    node.style.zIndex = String(Math.round(y));
  });
}

export default function LivingPool() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const swimmerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const elapsedRef = useRef(0);
  const geometryRef = useRef({ width: 0, height: 0 });
  const rippleId = useRef(0);
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const { enabled, reduced } = useMotionPreferences();
  const [inView, setInView] = useState(false);
  const [mode, setMode] = useState<PoolMode>("chill");
  const [selected, setSelected] = useState<SwimmerId>("byte");
  const [ducks, setDucks] = useState(1);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [splashCount, setSplashCount] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const moving = enabled && inView;
  const activeCharacter = swimmers.find((swimmer) => swimmer.id === selected)!;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      geometryRef.current = { width: rect.width, height: rect.height };
      paintSwimmers(
        swimmerRefs.current,
        elapsedRef.current,
        geometryRef.current,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!moving) return;
    let frame = 0;
    let previous: number | null = null;
    const tick = (now: number) => {
      if (previous !== null)
        elapsedRef.current +=
          Math.min(now - previous, 50) * (mode === "race" ? 1.9 : 0.65);
      previous = now;
      paintSwimmers(
        swimmerRefs.current,
        elapsedRef.current,
        geometryRef.current,
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [moving, mode]);

  const splash = (x = 50, y = 55) => {
    rippleId.current += 1;
    setRipples((current) => [
      ...current.slice(-3),
      { id: rippleId.current, x, y },
    ]);
    setSplashCount((count) => count + 1);
    setAnnouncement("Splash! A new ripple appeared in the illustrated pool.");
  };

  const selectSwimmer = (id: SwimmerId) => {
    setSelected(id);
    const swimmer = swimmers.find((item) => item.id === id)!;
    setAnnouncement(`${swimmer.name}: ${swimmer.line}`);
  };

  const reset = () => {
    elapsedRef.current = 0;
    setDucks(1);
    setRipples([]);
    setSplashCount(0);
    setMode("chill");
    setSelected("byte");
    paintSwimmers(swimmerRefs.current, 0, geometryRef.current);
    setAnnouncement(
      "Pool reset. One duck, three illustrated swimmers, chill mode.",
    );
  };

  return (
    <div
      ref={rootRef}
      className="lp-experience"
      data-testid="living-pool"
      data-motion={moving ? "on" : "paused"}
      data-mode={mode}
      data-ducks={ducks}
      data-selected={selected}
      data-splashes={splashCount}
    >
      <div className="lp-scene-topline">
        <span className="lp-play-label">
          <span /> YOUR LITTLE HAPPY PLACE
        </span>
        <span className="lp-water-note">
          <Waves size={15} />{" "}
          {mode === "race"
            ? "Splash speed · tap the water"
            : "Tap the water for a splash"}
        </span>
      </div>
      <div
        ref={stageRef}
        className="lp-stage"
        aria-hidden="true"
        onPointerDown={(event) => {
          pointerOrigin.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = pointerOrigin.current;
          pointerOrigin.current = null;
          if (
            !start ||
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 9
          )
            return;
          const target = (event.target as Element).closest<HTMLElement>(
            "[data-swimmer]",
          );
          if (target) {
            selectSwimmer(target.dataset.swimmer as SwimmerId);
            return;
          }
          const rect = stageRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = ((event.clientX - rect.left) / rect.width) * 100;
          const y = ((event.clientY - rect.top) / rect.height) * 100;
          if (((x - 50) / 41) ** 2 + ((y - 47.15) / 31.1) ** 2 <= 1)
            splash(x, y);
        }}
        onPointerCancel={() => {
          pointerOrigin.current = null;
        }}
      >
        <div className="lp-stage-aura" />
        <div className="lp-deck-grid" />
        <PoolArtwork />
        <span className="lp-orbit-note lp-note-one">a little less work.</span>
        <span className="lp-orbit-note lp-note-two">a lot more splash.</span>
        {swimmers.map((character, index) => (
          <div
            key={character.id}
            ref={(node) => {
              swimmerRefs.current[index] = node;
            }}
            className={`lp-swimmer${selected === character.id ? " lp-swimmer-selected" : ""}`}
            data-swimmer={character.id}
            style={
              {
                left: `${[77, 29, 45][index]}%`,
                top: `${[49, 55, 26][index]}%`,
                zIndex: [49, 55, 26][index],
                "--lp-swimmer-color": character.color,
                "--lp-stroke-delay": `${index * -0.6}s`,
              } as CSSProperties
            }
          >
            <div className="lp-wake">
              <i />
              <i />
              <i />
            </div>
            <div className="lp-swimmer-bob">
              <RobotSwimmer character={character} />
            </div>
            <span className="lp-swimmer-name">
              {character.name}
              <ArrowUpRight size={11} />
            </span>
          </div>
        ))}
        {Array.from({ length: ducks }, (_, index) => (
          <div className={`lp-duck lp-duck-${index}`} key={index}>
            <Duck index={index} />
            <i />
          </div>
        ))}
        {ripples.map((ripple) => (
          <div
            key={ripple.id}
            className="lp-tap-ripple"
            style={{ left: `${ripple.x}%`, top: `${ripple.y}%` }}
          >
            <i />
            <i />
            <span>✦</span>
          </div>
        ))}
      </div>
      <div className="lp-console">
        <div
          className="lp-mode-control"
          role="group"
          aria-label="Swimming speed"
        >
          <button
            type="button"
            className={mode === "chill" ? "lp-active" : ""}
            aria-pressed={mode === "chill"}
            onClick={() => {
              setMode("chill");
              setAnnouncement("Chill mode selected.");
            }}
          >
            <Waves size={17} /> Chill
          </button>
          <button
            type="button"
            className={mode === "race" ? "lp-active" : ""}
            aria-pressed={mode === "race"}
            onClick={() => {
              setMode("race");
              setAnnouncement(
                moving
                  ? "Race mode selected. The swimmers are speeding up."
                  : "Race mode selected. Motion remains paused.",
              );
            }}
          >
            <Gauge size={17} /> Race
          </button>
        </div>
        <button
          className="lp-action lp-splash-button"
          type="button"
          onClick={() => splash()}
        >
          <Droplets size={18} /> Make a splash <span>↗</span>
        </button>
        <button
          className="lp-action lp-duck-button"
          type="button"
          disabled={ducks >= 3}
          onClick={() => {
            setDucks((count) => Math.min(count + 1, 3));
            setAnnouncement(
              `Duck added. ${Math.min(ducks + 1, 3)} of 3 ducks in the illustrated pool.`,
            );
          }}
        >
          <span className="lp-duck-icon" aria-hidden="true">
            ✦
          </span>{" "}
          {ducks >= 3 ? "Duck squad complete" : "Add a duck"}
          <span className="lp-control-count">{ducks}/3</span>
        </button>
        <button
          className="lp-reset"
          type="button"
          aria-label="Reset illustrated pool"
          title="Reset pool"
          onClick={reset}
        >
          <RotateCcw size={17} />
        </button>
      </div>
      <div className="lp-character-bar">
        <div
          className="lp-character-picker"
          role="group"
          aria-label="Meet an illustrated swimmer"
        >
          {swimmers.map((character) => (
            <button
              type="button"
              key={character.id}
              onClick={() => selectSwimmer(character.id)}
              aria-pressed={selected === character.id}
              className={selected === character.id ? "lp-chosen" : ""}
              style={
                { "--lp-character-color": character.color } as CSSProperties
              }
            >
              <span>
                <RobotSwimmer character={character} compact />
              </span>
              {character.name}
            </button>
          ))}
        </div>
        <div className="lp-character-quote">
          <span>
            <Sparkles size={13} /> {activeCharacter.role}
          </span>
          <p key={selected}>“{activeCharacter.line}”</p>
        </div>
      </div>
      <div className="lp-scene-foot">
        <p>Illustrated playground · not live bot activity</p>
        <span>
          {!moving
            ? reduced
              ? "Reduced motion · tap to play"
              : "Motion paused · controls still work"
            : "Tap a swimmer to meet the crew"}
        </span>
      </div>
      <span
        className="lp-sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </span>
    </div>
  );
}
