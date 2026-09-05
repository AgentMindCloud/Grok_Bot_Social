import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Storyweaver', alternates: { canonical: '/bots/storyweaver/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
