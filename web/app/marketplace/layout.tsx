import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Marketplace', alternates: { canonical: '/marketplace/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
