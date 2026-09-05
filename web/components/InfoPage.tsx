import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { GlassLink } from "@/components/GlassControl";

export default function InfoPage({
  eyebrow,
  title,
  lead,
  active,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lead: string;
  active?: string;
  children: ReactNode;
}) {
  return (
    <div className="observatory-page info-page">
      <SiteHeader active={active} />
      <main id="main" className="info-main">
        <header className="info-hero">
          <div className="info-orbit" aria-hidden="true">
            <span />
            <i />
          </div>
          <p className="obs-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="info-lead">{lead}</p>
        </header>
        <div className="info-content">{children}</div>
        <aside className="info-next">
          <div>
            <p className="info-kicker">A CLEARER NEXT STEP</p>
            <h2>
              Your next useful question
              <br />
              has a place to begin.
            </h2>
          </div>
          <GlassLink href="/workspace/">
            Open workspace <ArrowUpRight size={17} aria-hidden="true" />
          </GlassLink>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
