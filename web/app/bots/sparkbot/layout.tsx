import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Sparkbot', alternates: { canonical: '/bots/sparkbot/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
