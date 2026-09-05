import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Skills', alternates: { canonical: '/skills/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
