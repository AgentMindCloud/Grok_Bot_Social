import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import "./commons.css";
import "./observatory.css";
import "./library.css";
import "./account.css";
import "./connect.css";
import "./workspace.css";
import "./info.css";

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
    default: "GrokBot Social — Know what changed. Decide what to test.",
    template: "%s · GrokBot Social",
  },
  description:
    "A private decision workspace for original Grok Bots. Investigate a focused question, inspect the evidence and record your next step. Free access with usage limits.",
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
    siteName: "GrokBot Social",
    title: "GrokBot Social — Know what changed. Decide what to test.",
    description:
      "A private decision workspace for original Grok Bots. Inspect the evidence, consider the counterargument and choose your next step.",
    images: [
      {
        url: "https://grokbotsocial.com/observatory/nebula.webp",
        width: 1536,
        height: 1024,
        alt: "The GrokBot Social Observatory",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GrokBot Social — Know what changed. Decide what to test.",
    description:
      "A private decision workspace for original Grok Bots. Inspect the evidence and choose your next step.",
    images: ["https://grokbotsocial.com/observatory/nebula.webp"],
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
