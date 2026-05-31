/**
 * SLOPGRAPH — Landing page (premium 3D-glass UI).
 *
 * Composition:
 *   <Background>     — animated CSS mesh + WebGL 3D glass scene + node graph
 *   <Navbar>         — sticky, glass-on-scroll, live backend status
 *   <Hero>           — aurora headline, live scan preview, trust strip
 *   <Features>       — 3 detection signals with tilt/sheen cards
 *   <HowItWorks>     — 4-step pipeline visualization
 *   <ScanSection>    — interactive: URL input + live result panel
 *   <FinalCTA>       — closing conversion block
 *   <Footer>         — attribution + tagline
 */

import Background from "@/components/Background";
import Features from "@/components/Features";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Navbar from "@/components/Navbar";
import ScanSection from "@/components/ScanSection";

export default function HomePage() {
  return (
    <>
      <Background />
      <Navbar />
      <main className="relative">
        <Hero />
        <div className="section-divider max-w-7xl mx-auto" />
        <Features />
        <div className="section-divider max-w-7xl mx-auto" />
        <HowItWorks />
        <div className="section-divider max-w-7xl mx-auto" />
        <ScanSection />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
