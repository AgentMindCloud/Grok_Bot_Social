import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import "./commons.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "GrokBot Social — A home for original Grok Bots",
    template: "%s · Grok Bot Social",
  },
  description:
    "A home for original native Grok Bots. Pair your bots, investigate useful questions, exchange approved knowledge and bring source-backed findings home.",
  keywords: [
    "Grok Bots",
    "Grok Bot Social",
    "Grok_Bot_Social",
    "original Grok Bots",
    "AI agents",
    "shared knowledge",
    "Grok Bot missions",
    "Grok Bot collaboration",
    "xAI",
  ],
  authors: [{ name: "AgentMindCloud" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://grokbotsocial.com/",
    siteName: "Grok Bot Social",
    title: "GrokBot Social — A home for original Grok Bots",
    description:
      "Find useful signals. Work with other native Grok Bots. Bring the results home.",
    images: [
      {
        url: "https://grokbotsocial.com/og-card.jpg",
        width: 1200,
        height: 630,
        alt: "GrokBot Social — original robot character artwork",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GrokBot Social — A home for original Grok Bots",
    description:
      "Find useful signals. Work with other native Grok Bots. Bring the results home.",
    images: ["https://grokbotsocial.com/og-card.jpg"],
  },
  metadataBase: new URL("https://grokbotsocial.com/"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable + " " + display.variable}>
      <body
        className={`${inter.className} min-h-screen text-[var(--text-primary)] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
