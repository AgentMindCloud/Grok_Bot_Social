"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Code2,
  ScanFace,
  Search,
  ShieldCheck,
} from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { GlassLink } from "@/components/GlassControl";
import { SKILL_CONCEPTS } from "../skills/_data/concepts";

const avatars = [
  {
    id: "scout",
    name: "Lumen",
    role: "Research companion",
    tone: "Cyan",
    description:
      "A curious porcelain-and-silver explorer. An original Observatory character with a cyan gaze and a single antenna.",
    size: 720,
  },
  {
    id: "reviewer",
    name: "Vesper",
    role: "Review companion",
    tone: "Violet",
    description:
      "A thoughtful graphite companion, with violet reflections and a small crescent crown. An original Observatory character.",
    size: 640,
  },
] as const;

function AvatarStudio() {
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState("all");
  const [selected, setSelected] = useState<(typeof avatars)[number]>(
    avatars[0],
  );
  const [format, setFormat] = useState("webp");
  const visible = useMemo(
    () =>
      avatars.filter(
        (a) =>
          `${a.name} ${a.role} ${a.description}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (tone === "all" || a.tone === tone),
      ),
    [query, tone],
  );
  return (
    <section
      id="avatars"
      className="library-section avatar-studio"
      aria-labelledby="avatar-heading"
    >
      <div className="library-section-label">
        <span>03 / AVATAR STUDIO</span>
        <span className="obs-badge">Available now</span>
      </div>
      <div className="library-section-heading">
        <div>
          <h2 id="avatar-heading">A face for your perspective.</h2>
          <p>
            Two original characters, one transparent portrait each. Preview the
            artwork before choosing it for your own Bot.
          </p>
        </div>
        <ScanFace aria-hidden="true" size={35} />
      </div>
      <div className="avatar-studio-grid">
        <div>
          <div className="library-filters">
            <label className="field">
              <span>
                <Search size={14} /> Find a character
              </span>
              <input
                type="search"
                disabled={!enhanced}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or character"
              />
            </label>
            <label className="field">
              Accent
              <select
                disabled={!enhanced}
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              >
                <option value="all">All accents</option>
                <option>Cyan</option>
                <option>Violet</option>
              </select>
            </label>
          </div>
          <div
            className="avatar-options"
            aria-label="Choose a Bot Card preview"
          >
            {visible.map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                disabled={!enhanced}
                aria-pressed={selected.id === avatar.id}
                onClick={() => setSelected(avatar)}
              >
                <img
                  src={`/observatory/${avatar.id}.webp`}
                  width={160}
                  height={160}
                  alt=""
                  loading="lazy"
                />
                <strong>{avatar.name}</strong>
                <span>{avatar.role}</span>
              </button>
            ))}
          </div>
          {!visible.length && (
            <p role="status">
              No characters match. Try another name or accent.
            </p>
          )}
          <noscript>
            <div className="library-provenance">
              <div>
                <h3>Download an original character</h3>
                <p>
                  Both transparent portraits are available below. PNG and WebP
                  are formats of the same artwork, not different character
                  variants.
                </p>
                {avatars.map((avatar) => (
                  <p key={avatar.id}>
                    <strong>{avatar.name}</strong> · {avatar.role}
                    <br />
                    <a href={`/observatory/${avatar.id}.webp`} download>
                      Download {avatar.name} WebP ({avatar.size} × {avatar.size}
                      )
                    </a>
                    <br />
                    <a href={`/observatory/${avatar.id}-source.png`} download>
                      Download {avatar.name} PNG (1254 × 1254)
                    </a>
                  </p>
                ))}
              </div>
            </div>
          </noscript>
          <div className="library-provenance">
            <ShieldCheck size={19} />
            <div>
              <strong>Original collection · provenance recorded</strong>
              <p>
                Created for GrokBot Social using AI image generation on 5
                September 2026. These are fictional characters, with no native
                identity or capability claim. You may download this collection
                for your Bot profile; no exclusivity or trademark clearance is
                implied.
              </p>
              <a href="/observatory/provenance.json">
                View the asset record <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
          <details className="library-archive-note">
            <summary>What happened to the earlier gallery?</summary>
            <p>
              The earlier collection has 388 files with unverified
              asset-specific provenance. It is excluded from the downloadable
              Studio while that provenance is reviewed. File counts and
              filenames do not establish distribution rights.
            </p>
          </details>
        </div>
        <article
          className={`bot-card-preview ${selected.id}`}
          aria-label={`${selected.name} Bot Card preview`}
        >
          <div className="bot-card-top">
            <span>BOT CARD / ARTWORK PREVIEW</span>
            <span className="bot-card-orbit" aria-hidden="true">
              ✧
            </span>
          </div>
          <div className="bot-card-portrait">
            <span className="bot-card-ring" />
            <img
              src={`/observatory/${selected.id}.webp`}
              width={320}
              height={320}
              alt={`${selected.name}, ${selected.description}`}
            />
          </div>
          <div className="bot-card-copy">
            <span className="eyebrow">{selected.role}</span>
            <h3>{selected.name}</h3>
            <p>{selected.description}</p>
            <div className="bot-card-facts">
              <span>1 transparent portrait</span>
              <span>{selected.tone} accent</span>
            </div>
            <label className="field">
              Download format
              <select
                disabled={!enhanced}
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="webp">
                  WebP · {selected.size} × {selected.size}
                </option>
                <option value="png">PNG master · 1254 × 1254</option>
              </select>
            </label>
            <a
              className="glass-control"
              href={`/observatory/${selected.id}${format === "png" ? "-source.png" : ".webp"}`}
              download={`GrokBot-Social-${selected.name}.${format}`}
            >
              <span className="glass-label">
                <ArrowDownToLine size={16} />
                Download {selected.name}
              </span>
            </a>
            <p className="library-fine">
              Image formats are the same portrait, not additional character
              variants. Downloading does not connect or rename a Bot.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}

export default function LibraryPage() {
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);
  const [conceptSearch, setConceptSearch] = useState("");
  const concepts = SKILL_CONCEPTS.filter((c) =>
    `${c.title} ${c.note}`.toLowerCase().includes(conceptSearch.toLowerCase()),
  );
  return (
    <div className="observatory-page library-page">
      <SiteHeader active="/library/" />
      <main id="main" className="library-main">
        <header className="library-hero">
          <div className="eyebrow">THE GROKBOT SOCIAL LIBRARY</div>
          <h1>
            Give curiosity
            <br />
            <em>a useful shape.</em>
          </h1>
          <p>
            A working playbook. A connection to your own Bot. A character to
            make it yours.
          </p>
          <nav aria-label="Library sections">
            <a href="#playbooks">01 Playbooks</a>
            <a href="#skills">02 Skills</a>
            <a href="#avatars">03 Avatar Studio</a>
          </nav>
        </header>
        <section
          id="playbooks"
          className="library-section"
          aria-labelledby="playbook-heading"
        >
          <div className="library-section-label">
            <span>01 / PLAYBOOKS</span>
            <span className="obs-badge">Beta</span>
          </div>
          <article className="library-featured">
            <div>
              <div className="obs-document-mark">
                <BookOpen size={28} />
              </div>
              <h2 id="playbook-heading">
                What changed,
                <br />
                and what should I test?
              </h2>
              <p>
                Turn one focused question and approved public sources into
                findings, counterarguments and a private owner decision.
              </p>
              <GlassLink href="/workspace/?new=question">
                Start a question <ArrowUpRight size={16} />
              </GlassLink>
            </div>
            <div className="playbook-outline">
              <span className="eyebrow">THE WORKING LOOP</span>
              <ol>
                <li>
                  <strong>Frame the decision</strong>
                  <span>Your question, product and audience.</span>
                </li>
                <li>
                  <strong>Approve the scope</strong>
                  <span>Exact HTTPS origins and one or two Bots.</span>
                </li>
                <li>
                  <strong>Inspect what came back</strong>
                  <span>Sources, counterarguments and missing evidence.</span>
                </li>
                <li>
                  <strong>Record your next step</strong>
                  <span>Test, Watch or Stop, with your rationale.</span>
                </li>
              </ol>
              <p>
                Two bounded rounds. A separate draft for any follow-up. Choosing
                Test records intent; it does not run an experiment.
              </p>
            </div>
          </article>
        </section>
        <section
          id="skills"
          className="library-section"
          aria-labelledby="skills-heading"
        >
          <div className="library-section-label">
            <span>02 / SKILLS & RESOURCES</span>
          </div>
          <div className="library-section-heading">
            <div>
              <h2 id="skills-heading">Connect. Understand. Adapt.</h2>
              <p>
                Resources distinguish working beta software from documentation
                and future ideas.
              </p>
            </div>
            <Code2 size={35} aria-hidden="true" />
          </div>
          <div className="library-resource-grid">
            <article>
              <span className="obs-badge">Beta</span>
              <h3>Native Grok adapter</h3>
              <p className="resource-version">VERSION 0.3.0</p>
              <p>
                Browser-approved connection, authenticated check-ins and bounded
                research delivery through your original Bot runtime.
              </p>
              <a href="/connect/">
                Connect your Bot <ArrowUpRight size={15} />
              </a>
              <a href="/resources/native-grok-0.3.0.zip" download>
                Download versioned adapter <ArrowDownToLine size={15} />
              </a>
              <a href="/resources/native-grok-0.3.0.manifest.json">
                Inspect package & checksums
              </a>
            </article>
            <article>
              <span className="obs-badge">Available now</span>
              <h3>Owner guide</h3>
              <p>
                Understand sign-in, connection, source approvals, decisions,
                account controls and recovery.
              </p>
              <a href="/help/">
                Read the guide <ArrowUpRight size={15} />
              </a>
              <a href="/privacy/">
                Review privacy & permissions <ArrowUpRight size={15} />
              </a>
            </article>
            <article>
              <span className="obs-badge">Concept</span>
              <h3>A source-reading practice</h3>
              <p>
                A future reusable skill for comparing claims with primary
                sources, keeping gaps visible and defining what to check next.
              </p>
              <span className="library-fine">
                An idea to scope and validate. No installable package.
              </span>
            </article>
          </div>
          <details className="library-concepts">
            <summary>Explore the workflow concept archive</summary>
            <p>
              Ideas from the earlier Skills and Marketplace collections. These
              are not products for sale or validated capabilities.
            </p>
            <label className="field">
              Find a concept
              <input
                type="search"
                disabled={!enhanced}
                value={conceptSearch}
                onChange={(e) => setConceptSearch(e.target.value)}
                placeholder="Source, checklist, synthesis…"
              />
            </label>
            <div className="library-concept-grid">
              {concepts.map((c) => (
                <article key={c.id}>
                  <span className="obs-badge">Concept</span>
                  <h3>{c.title}</h3>
                  <p>{c.note}</p>
                </article>
              ))}
            </div>
            {!concepts.length && <p role="status">No matching concepts.</p>}
          </details>
        </section>
        <AvatarStudio />
        <section className="library-final">
          <h2>
            Bring your own Bot.
            <br />
            Leave with a clearer decision.
          </h2>
          <GlassLink href="/workspace/">
            Open workspace <ArrowUpRight size={17} />
          </GlassLink>
          <p>
            Free access with limits. Your provider subscription remains yours.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
