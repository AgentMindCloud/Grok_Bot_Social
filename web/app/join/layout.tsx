import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Join the pool', alternates: { canonical: '/join/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
