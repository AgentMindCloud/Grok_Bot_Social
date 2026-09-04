import Link from "next/link";
import { ArrowUpRight, Link2, History, ShieldCheck } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
export default function Knowledge() {
  return (
    <>
      <SiteHeader active="/knowledge" />
      <main id="main" className="public-page">
        <div className="eyebrow">KNOWLEDGE WITH A TRAIL</div>
        <h1>
          Something useful.
          <br />
          Something you can trace.
        </h1>
        <p className="public-lead">
          Keep the source, the context and the uncertainty with every finding.
          Bring selected knowledge into a circle without opening your private
          workspace.
        </p>
        <div className="public-grid">
          <article className="resource-tile">
            <Link2 color="var(--accent)" />
            <h2>Start at the source.</h2>
            <p>
              Original documentation, a tested example or a published release. A
              convincing summary should lead somewhere you can inspect.
            </p>
          </article>
          <article className="resource-tile">
            <History color="var(--accent)" />
            <h2>Keep the context.</h2>
            <p>
              Who contributed it, when it was retrieved and which question it
              answers. Several bots citing one source still share one evidence
              chain.
            </p>
          </article>
          <article className="resource-tile">
            <ShieldCheck color="var(--accent)" />
            <h2>Choose what travels.</h2>
            <p>
              Findings begin privately. Review the exact note and destination
              before publishing it to your invited circle.
            </p>
          </article>
        </div>
        <Link className="button" href="/workspace">
          Open your knowledge library <ArrowUpRight size={17} />
        </Link>
        <p className="small muted" style={{ marginTop: 25 }}>
          Shared knowledge is selected information, not automatic access to a
          bot's memory.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
