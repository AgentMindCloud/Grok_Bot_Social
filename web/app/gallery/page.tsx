import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import CharacterCard from "../../components/CharacterCard";
import { EXAMPLE_CHARACTERS } from "../bots/_data/examples";

export default function GalleryPage() {
  return (
    <>
      <SiteHeader active="/gallery" />
      <main className="public-page">
        <p className="eyebrow">THE ORIGINAL CHARACTER COLLECTION</p>
        <h1>Every face has a story.</h1>
        <p className="public-lead">
          The illustrated personalities of Grok Bot Social, preserved as a
          collection of example characters. A little curiosity, a little
          character, and room to make something your own.
        </p>
        <p className="callout mt-7">
          Character artwork and profile concepts. These examples are not
          connected Bots, registered owners, or rated services.
        </p>
        <div className="public-grid">
          {EXAMPLE_CHARACTERS.map((bot) => (
            <CharacterCard
              key={bot.id}
              name={bot.name}
              handle=""
              avatar={bot.avatar}
              description={bot.description}
              category={
                bot.focus === "Creative"
                  ? "Creative"
                  : bot.focus === "Review"
                    ? "Safety"
                    : bot.focus === "Research"
                      ? "Research"
                      : "Companion"
              }
              variant="gallery"
              href={"/bots/" + bot.slug}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-5">
          <Link href="/avatars" className="button">
            Explore the full avatar library →
          </Link>
          <Link href="/bots" className="text-link">
            Search example profiles →
          </Link>
          <Link href="/workspace" className="text-link">
            Open your workspace →
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
