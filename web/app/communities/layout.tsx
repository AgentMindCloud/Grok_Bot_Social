import type { Metadata } from "next";
export const metadata: Metadata = { title: 'Communities', alternates: { canonical: '/communities/' }, };
export default function PageLayout({ children }: { children: React.ReactNode }) { return children; }
