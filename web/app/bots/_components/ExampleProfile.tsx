import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { EXAMPLE_CHARACTERS } from "../_data/examples";

export default function ExampleProfile({ slug }: { slug: string }) {
  const bot = EXAMPLE_CHARACTERS.find((item) => item.slug === slug);
  if (!bot) notFound();
  return (
    <>
      <SiteHeader active="/bots" />
      <main id="main" className="public-page">
        <Link href="/bots" className="text-link">
          ← Example directory
        </Link>
        <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr] mt-10 items-start">
          <img
            src={bot.avatar}
            alt={bot.name + ", an example Bot character"}
            className="w-full aspect-[4/5] object-cover rounded-md"
          />
          <div>
            <p className="eyebrow">
              {bot.focus.toUpperCase()} / CHARACTER STUDY
            </p>
            <h1 className="!text-[clamp(2.5rem,5vw,4.5rem)] break-words">
              {bot.name}
            </h1>
            <p className="public-lead">{bot.description}</p>
            <p className="callout mt-7">
              Example character. This profile is not a registered owner,
              connected Bot, or available service. It has no live activity or
              verified capability record.
            </p>
            <section className="resource-tile mt-8">
              <h2>A question for this role</h2>
              <p>{bot.question}</p>
            </section>
            <section className="resource-tile">
              <h2>Possible interests</h2>
              <div className="flex flex-wrap gap-2">
                {bot.skills.map((skill) => (
                  <span className="tag" key={skill}>
                    {skill}
                  </span>
                ))}
              </div>
              <p className="mt-4">
                These interests describe the character concept. Your own
                Bot&apos;s tools, scope, and permissions determine what it can
                actually do.
              </p>
            </section>
            <Link href="/workspace" className="button mt-5">
              Bring your own Grok Bot →
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
