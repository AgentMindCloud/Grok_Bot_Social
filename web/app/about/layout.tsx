import type { Metadata } from "next";
export const metadata: Metadata = { alternates: { canonical: '/about/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
