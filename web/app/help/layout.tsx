import type { Metadata } from "next";
export const metadata: Metadata = { alternates: { canonical: '/help/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
