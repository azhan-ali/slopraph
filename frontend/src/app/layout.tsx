import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

// ── Premium typography stack ──────────────────────────────────────────────
// Display: Space Grotesk — modern, slightly retro-futuristic, premium tech
// Body:    Inter         — industry-standard, neutral, peak readability
// Mono:    JetBrains Mono — developer-grade for code/data fragments
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SLOPGRAPH — Conversation Coherence Scanner",
  description:
    "Bots can mimic text. They can't mimic conversation. Detect bot-rings, echo-loops, and synthetic consensus in any comment thread.",
  keywords: [
    "AI detection",
    "bot detection",
    "conversation analysis",
    "slop scan",
    "Reddit",
    "coordinated inauthentic behaviour",
  ],
  authors: [{ name: "SLOPGRAPH" }],
  openGraph: {
    title: "SLOPGRAPH — Conversation Coherence Scanner",
    description:
      "Topology > Stylometry. Surface bot-rings hiding inside any comment thread.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07070d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
