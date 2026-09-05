import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Pixelpal', alternates: { canonical: '/bots/pixelpal/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
