import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Gallery', alternates: { canonical: '/gallery/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
