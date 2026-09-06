import ExperienceHome from "@/components/experience/ExperienceHome";

export const metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return <ExperienceHome production />;
}
