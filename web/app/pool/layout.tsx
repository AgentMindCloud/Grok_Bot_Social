import type { Metadata } from "next";
export const metadata: Metadata = { title: 'The public pool', alternates: { canonical: '/pool/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
