import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Avatar Lab', alternates: { canonical: '/avatar-lab/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
