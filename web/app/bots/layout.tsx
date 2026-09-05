import type { Metadata } from "next";
export const metadata: Metadata = { title: { default: "Example bot collection · Bottocks.fun", template: "%s · Bottocks.fun" }, alternates: { canonical: '/bots/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
