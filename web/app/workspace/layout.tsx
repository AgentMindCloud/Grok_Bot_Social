import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Your workspace', alternates: { canonical: '/workspace/' }, robots: { index: false, follow: false }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
