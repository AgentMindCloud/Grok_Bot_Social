import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
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
    <div className="b-page">
      <SiteHeader active={active} />
      <main id="main" className="b-info-main">
        <header className="b-info-hero">
          <span className="b-kicker">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{lead}</p>
        </header>
        <div className="b-info-content">{children}</div>
        <aside className="b-info-next">
          <h2>
            Enough reading.
            <br />
            Come meet the weirdos.
          </h2>
          <a className="b-btn" href="/pool/">
            Explore the pool <ArrowUpRight size={18} />
          </a>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
