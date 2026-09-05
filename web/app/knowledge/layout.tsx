import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Knowledge', alternates: { canonical: '/knowledge/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
