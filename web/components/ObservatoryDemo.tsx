"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Eye,
  FileSearch,
  FlaskConical,
  History,
  LockKeyhole,
  Pause,
  Play,
  Scale,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { GlassButton, GlassLink } from "./GlassControl";
import Modal from "./Modal";

type Decision = "Test" | "Watch" | "Stop";
const choices = [
  { label: "Test" as const, Icon: FlaskConical },
  { label: "Watch" as const, Icon: Eye },
  { label: "Stop" as const, Icon: Square },
];
const outcomes: Record<Decision, string> = {
  Test: "Try the shorter setup guide with a small group. Check whether it helps before changing the whole experience.",
  Watch:
    "Keep watching. The release note is promising, but it does not establish that our setup problem is solved.",
  Stop: "Set this idea aside. The available evidence does not justify spending time on it now.",
};
const sampleNotes = {
  evidence: {
    title: "Example release note: setup checklist",
    excerpt:
      "The sample product now combines its initial setup steps into a single checklist. Existing advanced settings remain available.",
    heading: "What this suggests",
    interpretation:
      "A shorter setup guide is a plausible small experiment. The source describes a capability; it does not establish a useful outcome for our users.",
  },
  review: {
    title: "Example reviewer note",
    excerpt:
      "Combining steps could make the guide shorter without making it clearer. The release note contains no evidence that new users understand the checklist.",
    heading: "What would change the decision",
    interpretation:
      "Observe whether people can complete setup and explain what they approved. Keep the current guide available while reviewing the result.",
  },
};
function SampleNote({ kind }: { kind: keyof typeof sampleNotes }) {
  const note = sampleNotes[kind];
  return (
    <>
      <h3>{note.title}</h3>
      <blockquote>{note.excerpt}</blockquote>
      <h3>{note.heading}</h3>
      <p>{note.interpretation}</p>
    </>
  );
}

export default function ObservatoryDemo() {
  const [enhanced, setEnhanced] = useState(false);
  const [choice, setChoice] = useState<Decision | null>(null);
  const [history, setHistory] = useState<Decision[]>([]);
  const [detail, setDetail] = useState<"evidence" | "review" | null>(null);
  const [paused, setPaused] = useState(false);
  const [systemReduced, setSystemReduced] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    setEnhanced(true);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const element = scene.current;
    if (!element || paused || systemReduced) return;
    let cleanup = () => {};
    let disposed = false;
    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (disposed) return;
        gsap.registerPlugin(ScrollTrigger);
        const context = gsap.context(() => {
          const floating = gsap.to(".obs-floating", {
            y: -7,
            rotation: 1.5,
            duration: 5.8,
            stagger: 1.6,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
          });
          let visible = true;
          let reading = false;
          const sync = () =>
            floating.paused(!visible || document.hidden || reading);
          const observer = new IntersectionObserver((entries) => {
            visible = entries[0].isIntersecting;
            sync();
          });
          observer.observe(element);
          const readStart = () => {
            reading = true;
            sync();
          };
          const readEnd = () => {
            reading = false;
            sync();
          };
          card.current?.addEventListener("pointerenter", readStart);
          card.current?.addEventListener("pointerleave", readEnd);
          card.current?.addEventListener("focusin", readStart);
          card.current?.addEventListener("focusout", readEnd);
          document.addEventListener("visibilitychange", sync);
          gsap.fromTo(
            ".obs-path-energy",
            { strokeDashoffset: 600 },
            {
              strokeDashoffset: 0,
              duration: 1.4,
              ease: "power2.out",
              scrollTrigger: { trigger: element, start: "top 90%", once: true },
            },
          );
          cleanup = () => {
            observer.disconnect();
            document.removeEventListener("visibilitychange", sync);
            card.current?.removeEventListener("pointerenter", readStart);
            card.current?.removeEventListener("pointerleave", readEnd);
            card.current?.removeEventListener("focusin", readStart);
            card.current?.removeEventListener("focusout", readEnd);
            context.revert();
          };
        }, element);
      })
      .catch(() => {
        /* The full static scene remains available when motion cannot load. */
      });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [paused, systemReduced]);
  const saved = history.at(-1);
  return (
    <>
      <div className="obs-scene" ref={scene} id="sample-mission">
        <div className="obs-orbit obs-orbit-one" aria-hidden="true" />
        <div className="obs-orbit obs-orbit-two" aria-hidden="true" />
        <svg className="obs-paths" viewBox="0 0 600 650" aria-hidden="true">
          <defs>
            <linearGradient id="obs-energy">
              <stop stopColor="#73eaff" />
              <stop offset="1" stopColor="#b799ff" />
            </linearGradient>
          </defs>
          <path d="M64 272 Q160 260 220 166 M530 450 Q465 410 434 341" />
          <path
            className="obs-path-energy"
            d="M64 272 Q160 260 220 166 M530 450 Q465 410 434 341"
          />
        </svg>
        <img
          className="obs-scout obs-floating"
          src="/observatory/scout.webp"
          width="720"
          height="720"
          alt="Original porcelain Scout character with cyan eyes"
          fetchPriority="high"
        />
        <img
          className="obs-reviewer obs-floating"
          src="/observatory/reviewer.webp"
          width="640"
          height="640"
          alt="Original moon-crowned Reviewer character"
        />
        <span className="obs-glass-pebble pebble-one" aria-hidden="true" />
        <span className="obs-glass-pebble pebble-two" aria-hidden="true" />
        <article
          ref={card}
          className="obs-sample-card"
          aria-label={
            enhanced ? "Interactive sample mission" : "Sample mission preview"
          }
        >
          <div className="obs-card-top">
            <span>
              <Sparkles size={13} /> ILLUSTRATIVE PRIVATE MISSION
            </span>
            <span className="obs-private">
              <LockKeyhole size={11} /> PRIVATE
            </span>
          </div>
          <h2>A clearer next step.</h2>
          <p className="obs-card-question">
            Should we test a shorter setup guide?
          </p>
          <button
            type="button"
            disabled={!enhanced}
            className="obs-evidence-row"
            onClick={() => setDetail("evidence")}
            aria-haspopup="dialog"
          >
            <span className="obs-evidence-icon">
              <FileSearch size={22} />
            </span>
            <span>
              <small>Evidence to inspect</small>
              <strong>A simpler setup is now possible</strong>
              <em>Sample source · inspect the excerpt</em>
            </span>
            <ChevronRight size={17} />
          </button>
          <button
            type="button"
            disabled={!enhanced}
            className="obs-evidence-row"
            onClick={() => setDetail("review")}
            aria-haspopup="dialog"
          >
            <span className="obs-evidence-icon reviewer">
              <Scale size={22} />
            </span>
            <span>
              <small>Counterargument to consider</small>
              <strong>Fewer steps may still be confusing</strong>
              <em>Sample review · consider the trade-off</em>
            </span>
            <ChevronRight size={17} />
          </button>
          <fieldset className="obs-decision" disabled={!enhanced}>
            <legend>Your decision</legend>
            <div>
              {choices.map(({ label, Icon }) => (
                <button
                  type="button"
                  key={label}
                  aria-pressed={choice === label}
                  className={choice === label ? "is-selected" : ""}
                  onClick={() => setChoice(label)}
                >
                  <Icon size={23} />
                  <span>{label}</span>
                  {choice === label && (
                    <Check className="obs-choice-check" size={12} />
                  )}
                </button>
              ))}
            </div>
          </fieldset>
          <GlassButton
            className="obs-record"
            disabled={!choice || saved === choice}
            onClick={() =>
              choice && setHistory((previous) => [...previous, choice])
            }
          >
            {saved === choice && choice ? (
              <>
                <Check size={17} /> Sample decision saved
              </>
            ) : (
              <>
                Save sample decision <ArrowRight size={17} />
              </>
            )}
          </GlassButton>
          <p className="obs-card-note">
            Recording a decision does not run an experiment.
          </p>
          <div className="obs-demo-status" aria-live="polite">
            {saved ? (
              <>
                <History size={13} />
                <span>
                  Sample revision {history.length} · {saved}
                  <br />
                  <small>Saved in this demo only.</small>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setChoice(null);
                    setHistory([]);
                  }}
                  aria-label="Reset sample decision"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <span>
                Interactive example · no account or real mission created
              </span>
            )}
          </div>
        </article>
        <button
          type="button"
          className="obs-motion"
          disabled={!enhanced || systemReduced}
          onClick={() => setPaused((value) => !value)}
          aria-pressed={paused || systemReduced}
        >
          {paused || systemReduced ? <Play size={12} /> : <Pause size={12} />}{" "}
          {!enhanced
            ? "Static scene"
            : systemReduced
              ? "Reduced motion"
              : paused
                ? "Play motion"
                : "Pause motion"}
        </button>
      </div>
      <noscript>
        <section
          className="obs-sample-outcome obs-source-detail"
          aria-label="Read the sample mission"
        >
          <span className="obs-badge">
            ILLUSTRATIVE CONTENT · READ-ONLY SAMPLE
          </span>
          <h3>Inspect the sample brief.</h3>
          <p>
            This fictional product and source demonstrate the workflow. No
            account, mission or decision is created by reading the sample.
          </p>
          <details>
            <summary>Inspect the sample evidence</summary>
            <SampleNote kind="evidence" />
          </details>
          <details>
            <summary>Read the counterargument</summary>
            <SampleNote kind="review" />
          </details>
          <details>
            <summary>Compare Test, Watch and Stop</summary>
            {choices.map(({ label }) => (
              <section key={label}>
                <h3>{label}</h3>
                <p>{outcomes[label]}</p>
              </section>
            ))}
            <p>
              Recording Test does not execute an experiment. A saved sample
              revision belongs only to the interactive demo.
            </p>
          </details>
        </section>
      </noscript>
      {detail && (
        <Modal
          title={
            detail === "evidence"
              ? "Inspect the sample source"
              : "Consider the counterargument"
          }
          onClose={() => setDetail(null)}
        >
          <div className="obs-source-detail">
            <span className="obs-badge">ILLUSTRATIVE CONTENT</span>
            <p className="small muted">
              Fictional product and source, written only to demonstrate the
              workflow. This is not a claim about a real release.
            </p>
            <SampleNote kind={detail} />
            <GlassButton onClick={() => setDetail(null)}>
              Return to the decision <ArrowRight size={16} />
            </GlassButton>
          </div>
        </Modal>
      )}
      {saved && (
        <div className="obs-sample-outcome" role="status">
          <strong>Your sample decision: {saved}</strong>
          <p>{outcomes[saved]}</p>
          <GlassLink variant="quiet" href="/workspace/?new=question">
            Start your own question <ArrowRight size={15} />
          </GlassLink>
        </div>
      )}
    </>
  );
}

export function CircleExample() {
  const [step, setStep] = useState(0);
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);
  const descriptions = [
    "The finding begins private. Circle membership alone does not share it.",
    "Review this exact sample finding and its destination: Example Toolmakers Circle.",
    "You approved this snapshot. Other findings and your decision history stay private.",
    "A later Bot can use the approved note as a lead, reopen its source and challenge it.",
  ];
  return (
    <section className="obs-section obs-circle" aria-labelledby="circle-title">
      <div>
        <div className="eyebrow">OPTIONAL CIRCLE COLLABORATION</div>
        <h2 id="circle-title">
          One finding.
          <br />
          Shared on your terms.
        </h2>
        <p>
          Bring another perspective into a separate circle mission. You choose
          exactly what crosses the boundary.
        </p>
        <p className="obs-note">
          <LockKeyhole size={15} /> Weekly mission evidence always stays
          private.
        </p>
      </div>
      <div className="obs-circle-example">
        <span className="obs-badge">SEPARATE CIRCLE MISSION · SAMPLE</span>
        <div className="obs-boundary">
          <span className={step < 2 ? "active" : ""}>
            <LockKeyhole size={24} />
            Private finding
          </span>
          <svg viewBox="0 0 150 30" aria-hidden="true">
            <path className={step >= 2 ? "approved" : ""} d="M0 15H150" />
            <path d="M75 0V30" className="boundary" />
          </svg>
          <span className={step >= 2 ? "active" : ""}>
            <ShieldCheck size={24} />
            {step >= 2 ? "Approved snapshot" : "Circle"}
          </span>
        </div>
        <blockquote>
          “The example checklist combines the setup steps. Usability still needs
          a direct test.”
        </blockquote>
        <p aria-live="polite">{descriptions[step]}</p>
        <GlassButton
          variant="quiet"
          disabled={!enhanced}
          onClick={() => setStep((value) => (value + 1) % 4)}
        >
          {
            [
              "Review sample sharing",
              "Approve this sample snapshot",
              "Show source rechecking",
              "Reset sample",
            ][step]
          }{" "}
          <ArrowRight size={15} />
        </GlassButton>
        <small>Demo only. No content is published.</small>
        <noscript>
          <details>
            <summary>Read the sharing approval sequence</summary>
            <ol>
              {descriptions.map((description, index) => (
                <li key={description}>
                  {index === 2
                    ? "After an owner approves this exact snapshot, other findings and decision history stay private."
                    : description}
                </li>
              ))}
            </ol>
            <p>
              This example does not share anything. Weekly mission evidence
              stays private.
            </p>
          </details>
        </noscript>
      </div>
    </section>
  );
}
