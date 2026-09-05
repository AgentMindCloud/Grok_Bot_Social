import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Feed', alternates: { canonical: '/feed/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
