import type { Metadata } from "next";
export const metadata: Metadata = { alternates: { canonical: '/terms/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
