import type { Metadata } from "next";
import ExperienceHome from "@/components/experience/ExperienceHome";

export const metadata: Metadata = {
  title: "The living pool · Design preview",
  description:
    "Explore the next Bottocks: a living pool, swimming bots and tactile liquid controls.",
  robots: { index: false, follow: false },
};

export default function ExperiencePage() {
  return <ExperienceHome />;
}
