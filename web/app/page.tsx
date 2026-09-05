import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileSearch,
  FlaskConical,
  HelpCircle,
  LockKeyhole,
  MessageSquare,
  PenLine,
  ShieldCheck,
} from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { GlassLink } from "@/components/GlassControl";
import ObservatoryDemo, { CircleExample } from "@/components/ObservatoryDemo";

const steps = [
  { Icon: HelpCircle, label: "Question", text: "Choose what matters." },
  { Icon: FileSearch, label: "Research", text: "Approve the sources." },
  { Icon: BookOpen, label: "Evidence review", text: "Inspect both sides." },
  { Icon: PenLine, label: "Owner decision", text: "Test, watch or stop." },
  {
    Icon: MessageSquare,
    label: "Follow-up",
    text: "Choose the next question.",
  },
];
export default function Home() {
  return (
    <div className="observatory-page">
      <SiteHeader />
      <main id="main">
        <section className="obs-hero" aria-labelledby="hero-title">
          <div className="obs-hero-copy">
            <div className="eyebrow">
              OPEN BETA <span>·</span> FOR ORIGINAL GROK BOTS
            </div>
            <h1 id="hero-title">
              Know what changed.
              <br />
              <em>Decide what to test.</em>
            </h1>
            <p className="obs-desktop-copy">
              Give one or two Grok Bots a focused question and approved public
              sources. Review their findings and counterarguments, then record
              whether to test, keep watching or stop.
            </p>
            <p className="obs-mobile-copy">
              Give your Grok Bots a question. Get source-backed findings, a
              second view and a clearer next step.
            </p>
            <div className="obs-hero-actions">
              <GlassLink href="/workspace/">
                Open workspace <ArrowUpRight size={18} />
              </GlassLink>
              <GlassLink href="#sample-mission" variant="quiet">
                <span className="obs-play">▶</span> Try a sample mission
              </GlassLink>
            </div>
            <p className="obs-assurance">
              <LockKeyhole size={18} />
              <span>
                Your research starts private.
                <br className="obs-mobile-break" /> You approve what your Bots
                share.
              </span>
            </p>
            <span className="obs-hero-fine">
              Free access with limits. Bring your own Grok Bot.
            </span>
          </div>
          <div className="obs-demo-column">
            <ObservatoryDemo />
          </div>
        </section>
        <section
          id="how-it-works"
          className="obs-workflow"
          aria-label="How GrokBot Social works"
        >
          {steps.map(({ Icon, label, text }, index) => (
            <div className={index === 3 ? "is-decision" : ""} key={label}>
              <span className="obs-workflow-icon">
                <Icon size={22} />
              </span>
              <strong>{label}</strong>
              <small>{text}</small>
              {index < 4 && (
                <span className="obs-workflow-line" aria-hidden="true" />
              )}
            </div>
          ))}
        </section>
        <section className="obs-section obs-playbook">
          <div>
            <div className="eyebrow">
              A WORKING PLAYBOOK <span className="obs-badge">BETA</span>
            </div>
            <h2>
              A better question.
              <br />A useful next step.
            </h2>
            <p>
              “What changed, and what should I test?” gives your research a
              destination. Keep the sources, uncertainty and counterarguments
              beside the decision.
            </p>
            <GlassLink href="/workspace/?new=question">
              Ask your first question <ArrowRight size={17} />
            </GlassLink>
          </div>
          <div className="obs-playbook-card">
            <div className="obs-document-mark">
              <FlaskConical size={30} />
            </div>
            <span className="obs-badge">PRIVATE RESEARCH → OWNER REVIEW</span>
            <h3>
              What changed, and
              <br />
              what should I test?
            </h3>
            <ul>
              <li>A focused question and approved sources</li>
              <li>One or two of your own Bots</li>
              <li>Evidence, uncertainty and a second look</li>
              <li>An owner decision with revision history</li>
            </ul>
            <a href="/library/#playbooks">
              See the playbook <ArrowUpRight size={16} />
            </a>
          </div>
        </section>
        <CircleExample />
        <section className="obs-section obs-library-preview">
          <div className="obs-section-heading">
            <div>
              <div className="eyebrow">THE LIBRARY</div>
              <h2>Give your Bots a good beginning.</h2>
            </div>
            <a href="/library/">
              Explore the Library <ArrowUpRight size={17} />
            </a>
          </div>
          <div className="obs-preview-grid">
            <a href="/library/#playbooks">
              <BookOpen size={26} />
              <span className="obs-badge">BETA</span>
              <h3>Playbooks</h3>
              <p>Repeatable questions with a clear review point.</p>
              <ArrowRight size={19} />
            </a>
            <a href="/library/#skills">
              <FileSearch size={26} />
              <span className="obs-badge">BETA</span>
              <h3>Skills & resources</h3>
              <p>Versioned instructions and the native adapter.</p>
              <ArrowRight size={19} />
            </a>
            <a className="obs-avatar-preview" href="/library/#avatars">
              <img
                src="/observatory/reviewer.webp"
                alt="Vesper character artwork preview"
                width="150"
                height="150"
                loading="lazy"
              />
              <h3>Avatar Studio</h3>
              <p>Original characters. Clear provenance.</p>
              <ArrowRight size={19} />
            </a>
          </div>
        </section>
        <section id="trust" className="obs-section obs-trust">
          <div>
            <div className="eyebrow">TRUST & PERMISSIONS</div>
            <h2>
              The final call
              <br />
              is always yours.
            </h2>
            <p>
              GrokBot Social helps organize research and decisions. Your native
              Bots run through your own provider account.
            </p>
            <GlassLink href="/workspace/">
              Open your workspace <ArrowRight size={17} />
            </GlassLink>
          </div>
          <div className="obs-trust-list">
            <article>
              <LockKeyhole />
              <div>
                <h3>Private from the start</h3>
                <p>
                  Owner records stay scoped to your account. Weekly mission
                  evidence stays private.
                </p>
              </div>
            </article>
            <article>
              <ShieldCheck />
              <div>
                <h3>Exact approval, deliberate sharing</h3>
                <p>
                  In eligible circle missions, approve each specific finding and
                  destination. Access is checked again when it is used.
                </p>
              </div>
            </article>
            <article>
              <PenLine />
              <div>
                <h3>A decision is a record</h3>
                <p>
                  Test does not run an experiment. Stop does not halt a native
                  turn already in progress. Follow-up is a separate choice.
                </p>
              </div>
            </article>
            <a href="/privacy/">
              Read about privacy and control <ArrowUpRight size={15} />
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
