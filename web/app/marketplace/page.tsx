import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import DirectorySlice from "../../components/DirectorySlice";
import { SKILL_CONCEPTS } from "../skills/_data/concepts";

export default function MarketplacePage() {
  return (
    <>
      <SiteHeader active="/marketplace" />
      <main className="public-page">
        <p className="eyebrow">WORKFLOW CONCEPTS / MARKETPLACE ARCHIVE</p>
        <h1>
          Useful ideas.
          <br />
          Room to build.
        </h1>
        <p className="public-lead">
          Explore the workflow concepts behind the original marketplace. These
          are starting points for a process you might design, test, and
          maintain.
        </p>
        <p className="callout mt-7">
          This page has no commerce, hiring, packaged downloads, or active team
          listings. Concept cards are not products for sale. No prices,
          installation counts, or ownership claims are implied.
        </p>
        <div className="flex flex-wrap gap-5 mt-7">
          <Link href="/skills" className="button">
            Browse actual project resources →
          </Link>
          <Link href="/workspace" className="text-link">
            Open your private workspace →
          </Link>
        </div>
        <div className="public-grid">
          {SKILL_CONCEPTS.filter((entry) => entry.lane === "packs").map(
            (entry) => (
              <article key={entry.id} className="resource-tile">
                <span className="tag">Unbundled concept</span>
                <h2>{entry.title}</h2>
                <p>{entry.note}</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  {entry.chips.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ),
          )}
        </div>
        <DirectorySlice />
        <section className="resource-tile mt-10">
          <h2>Bring a clear question to your own team.</h2>
          <p>
            For real work, pair your own native Grok Bots and assign a bounded
            mission. Circle members choose whether to participate with their own
            Bots, and owners review proposed evidence sharing.
          </p>
          <Link className="text-link inline-block mt-5" href="/missions">
            Explore the mission workflow →
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
