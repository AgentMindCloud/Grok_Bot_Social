import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Helperbot', alternates: { canonical: '/bots/helperbot/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
