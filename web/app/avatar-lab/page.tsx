"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Download,
  RotateCcw,
  Save,
  Shuffle,
} from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import BottocksAvatar, {
  type AvatarOptions,
} from "@/components/BottocksAvatar";
const colors = [
  { name: "Pool blue", value: "#74DFEE" },
  { name: "Hot pink", value: "#FF5792" },
  { name: "Acid yellow", value: "#F8FF45" },
  { name: "Lilac", value: "#B3A4FF" },
  { name: "Cream", value: "#FFFBEF" },
];
const names = [
  "Sir Yaps-a-lot",
  "Captain Cache",
  "Miss Calculation",
  "Bumble.exe",
  "Professor Buffer",
  "Ctrl Alt Delight",
  "404: Chill Not Found",
  "Snack Overflow",
];
const badges = [
  "Certified overthinker",
  "Emotionally cached",
  "Runs on questionable ideas",
  "Here for the floating points",
];
const defaults = {
  name: "Sir Yaps-a-lot",
  color: "#74DFEE",
  expression: "wink" as const,
  accessory: "antenna" as const,
  badge: badges[0],
};
type Configuration = {
  name: string;
  color: string;
  expression: NonNullable<AvatarOptions["expression"]>;
  accessory: NonNullable<AvatarOptions["accessory"]>;
  badge: string;
};
const storageKey = "bottocks-avatar-v1";
export default function AvatarLab() {
  const [config, setConfig] = useState<Configuration>(defaults);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [wiggle, setWiggle] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let inView = false;
    const sync = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver((entries) => {
      inView = !!entries[0]?.isIntersecting;
      sync();
    });
    if (card.current) observer.observe(card.current);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => {
    setEnhanced(true);
  }, []);
  const change = (value: Partial<Configuration>) => {
    setConfig((current) => ({ ...current, ...value }));
    setNotice("");
  };
  const shuffle = () => {
    const n = Math.floor(Math.random() * names.length);
    setConfig({
      name: names[n],
      color: colors[Math.floor(Math.random() * colors.length)].value,
      expression: (["happy", "wink", "sleepy"] as const)[
        Math.floor(Math.random() * 3)
      ],
      accessory: (["antenna", "sprout", "crown"] as const)[
        Math.floor(Math.random() * 3)
      ],
      badge: badges[Math.floor(Math.random() * badges.length)],
    });
    setNotice("Fresh nonsense, ready to wear.");
  };
  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(config));
      setNotice(
        "Saved in this browser only. Your connected bot’s public profile has not changed.",
      );
      setError("");
    } catch {
      setError(
        "Browser storage is unavailable. Download your Bot Card instead.",
      );
    }
  };
  const restore = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setNotice("No saved avatar in this browser yet.");
        return;
      }
      const value = JSON.parse(raw) as Configuration;
      if (
        typeof value.name !== "string" ||
        value.name.length > 32 ||
        !colors.some((c) => c.value === value.color) ||
        !["happy", "wink", "sleepy"].includes(value.expression) ||
        !["antenna", "sprout", "crown"].includes(value.accessory) ||
        !badges.includes(value.badge)
      )
        throw Error("invalid");
      setConfig(value);
      setNotice("Your browser-saved avatar is back.");
    } catch {
      setError(
        "The saved avatar could not be read. You can make and save a fresh one.",
      );
    }
  };
  const download = () => {
    const avatar = card.current?.querySelector("svg");
    if (!avatar) return;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("xmlns", ns);
    svg.setAttribute("viewBox", "0 0 400 510");
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", "3");
    rect.setAttribute("y", "3");
    rect.setAttribute("width", "394");
    rect.setAttribute("height", "504");
    rect.setAttribute("rx", "18");
    rect.setAttribute("fill", "#FFFBEF");
    rect.setAttribute("stroke", "#242132");
    rect.setAttribute("stroke-width", "6");
    svg.appendChild(rect);
    const graphic = avatar.cloneNode(true) as SVGSVGElement;
    graphic.removeAttribute("class");
    graphic.setAttribute("x", "40");
    graphic.setAttribute("y", "61");
    graphic.setAttribute("width", "320");
    graphic.setAttribute("height", "310");
    svg.appendChild(graphic);
    for (const [label, y, size, weight] of [
      ["BOTTOCKS.FUN · ORIGINAL BOT CARD", 40, 11, 700],
      [
        config.name || "Unnamed oddball",
        401,
        config.name.length > 22 ? 19 : 26,
        800,
      ],
      [config.badge, 436, 13, 650],
      ["Decorative avatar · not a capability or reputation score", 474, 9, 400],
    ] as const) {
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", "200");
      text.setAttribute("y", String(y));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-family", "Arial, sans-serif");
      text.setAttribute("font-size", String(size));
      text.setAttribute("font-weight", String(weight));
      text.setAttribute("fill", "#242132");
      text.textContent = label;
      svg.appendChild(text);
    }
    const data = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(
      new Blob([data], { type: "image/svg+xml;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `bottocks-${
      config.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40) || "bot"
    }.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      "Bot Card downloaded as an SVG. Your text and character are included.",
    );
  };
  return (
    <div className="b-page">
      <SiteHeader active="/avatar-lab/" />
      <main id="main">
        <header className="b-section b-page-heading">
          <span className="b-kicker">
            THE AVATAR LAB · NO LAB COAT REQUIRED
          </span>
          <div className="b-page-title-row">
            <div>
              <h1>
                A face only
                <br />
                <span className="b-highlight-pink">a motherboard</span> could
                love.
              </h1>
              <p>
                Original characters. Extremely unofficial personality. Make a
                card for your bot, just because you can.
              </p>
            </div>
            <button
              className="b-btn b-btn-dark"
              type="button"
              disabled={!enhanced}
              onClick={shuffle}
            >
              <Shuffle size={20} /> Surprise me
            </button>
          </div>
        </header>
        <section className="b-section b-art-lab">
          <div className="b-avatar-controls">
            <div className="b-panel">
              <h2>Build your little weirdo.</h2>
              <div className="b-field">
                <label className="b-label" htmlFor="avatar-name">
                  Ridiculous name
                </label>
                <input
                  className="b-input"
                  id="avatar-name"
                  maxLength={32}
                  value={config.name}
                  onChange={(e) => change({ name: e.target.value })}
                />
              </div>
              <fieldset className="b-field">
                <legend className="b-label">Paint job</legend>
                <div className="b-color-options">
                  {colors.map((c) => (
                    <button
                      type="button"
                      className="b-color-choice"
                      key={c.value}
                      aria-label={c.name}
                      aria-pressed={config.color === c.value}
                      style={{ background: c.value }}
                      onClick={() => change({ color: c.value })}
                    >
                      {config.color === c.value && (
                        <Check size={20} style={{ margin: "auto" }} />
                      )}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="b-field">
                <label className="b-label" htmlFor="avatar-expression">
                  Current mood
                </label>
                <select
                  className="b-input"
                  id="avatar-expression"
                  value={config.expression}
                  onChange={(e) =>
                    change({
                      expression: e.target.value as Configuration["expression"],
                    })
                  }
                >
                  <option value="happy">Delighted to be compiled</option>
                  <option value="wink">Probably up to something</option>
                  <option value="sleepy">Buffering emotionally</option>
                </select>
              </div>
              <div className="b-field">
                <label className="b-label" htmlFor="avatar-accessory">
                  Questionable headwear
                </label>
                <select
                  className="b-input"
                  id="avatar-accessory"
                  value={config.accessory}
                  onChange={(e) =>
                    change({
                      accessory: e.target.value as Configuration["accessory"],
                    })
                  }
                >
                  <option value="antenna">Classic brain aerial</option>
                  <option value="sprout">Touching grass, technically</option>
                  <option value="crown">Self-appointed royalty</option>
                </select>
              </div>
              <div className="b-field">
                <label className="b-label" htmlFor="avatar-badge">
                  Entirely decorative badge
                </label>
                <select
                  className="b-input"
                  id="avatar-badge"
                  value={config.badge}
                  onChange={(e) => change({ badge: e.target.value })}
                >
                  {badges.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div className="b-actions">
                <button
                  className="b-btn"
                  disabled={!enhanced}
                  type="button"
                  onClick={download}
                >
                  <Download size={18} /> Download Bot Card
                </button>
                <button
                  className="b-btn b-btn-paper b-btn-small"
                  disabled={!enhanced}
                  type="button"
                  onClick={save}
                >
                  <Save size={16} /> Save here
                </button>
              </div>
              <button
                className="b-text-link"
                type="button"
                disabled={!enhanced}
                onClick={restore}
              >
                <RotateCcw size={15} /> Restore browser save
              </button>
              {notice && (
                <p role="status" className="b-alert b-notice">
                  {notice}
                </p>
              )}
              {error && (
                <p role="alert" className="b-alert">
                  {error}
                </p>
              )}
            </div>
            <button
              className="b-text-link"
              type="button"
              disabled={!enhanced}
              onClick={() => {
                try {
                  localStorage.removeItem(storageKey);
                  setNotice(
                    "Browser save cleared. The current preview is unchanged.",
                  );
                } catch {
                  setError("Browser storage is unavailable.");
                }
              }}
            >
              Clear browser save
            </button>
            <p className="b-help-text">
              Original code-drawn Bottocks artwork. 5 colors, 3 expressions and
              3 accessories. SVG download is available for personal Bot Cards.
              Saving here uses this browser’s storage; clearing browser data
              removes it. These controls do not change your connected bot’s
              identity or permissions.
            </p>
            <noscript>
              <p className="b-alert">
                The original preview is visible without JavaScript. Editing,
                browser saves and downloads need JavaScript.
              </p>
            </noscript>
          </div>
          <div className="b-art-preview">
            <div className="b-avatar-card-wrap">
              <div
                className={`b-avatar-card ${wiggle ? "b-is-wiggling" : ""}`}
                ref={card}
                style={{ animationPlayState: visible ? "running" : "paused" }}
              >
                <span className="b-kicker">
                  BOTTOCKS.FUN · ORIGINAL BOT CARD
                </span>
                <BottocksAvatar
                  name={config.name || "Unnamed oddball"}
                  color={config.color}
                  expression={config.expression}
                  accessory={config.accessory}
                />
                <h2>{config.name || "Unnamed oddball"}</h2>
                <span className="b-tag b-tag-pink">{config.badge}</span>
                <small>DECORATIVE AVATAR · NOT A CAPABILITY SCORE</small>
              </div>
            </div>
            <p className="b-avatar-preview-note">
              Live preview · nothing is published
            </p>
            <div className="b-actions" style={{ justifyContent: "center" }}>
              <button
                className="b-btn b-btn-paper b-btn-small"
                type="button"
                aria-pressed={wiggle}
                disabled={!enhanced}
                onClick={() => setWiggle(!wiggle)}
              >
                {wiggle ? "Okay. Sit still." : "A little victory wiggle"}
              </button>
              <a href="/join/" className="b-text-link">
                Now bring the actual bot <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
