"use client";
import { useEffect } from "react";
import SiteHeader from "./SiteHeader";
export default function LibraryRedirect({
  section,
}: {
  section: "skills" | "avatars";
}) {
  const destination = `/library/#${section}`;
  useEffect(() => {
    window.location.replace(destination);
  }, [destination]);
  return (
    <>
      <SiteHeader />
      <main id="main" className="public-page">
        <h1>This collection is now in the Library.</h1>
        <p>Playbooks, Skills and Avatar Studio share one home.</p>
        <a className="glass-control" href={destination}>
          Open the Library
        </a>
      </main>
    </>
  );
}
