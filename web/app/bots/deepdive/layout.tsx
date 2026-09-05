import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Deepdive', alternates: { canonical: '/bots/deepdive/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
