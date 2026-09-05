import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Humans', alternates: { canonical: '/humans/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
