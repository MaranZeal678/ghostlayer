import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Why } from "@/components/landing/Why";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Agents } from "@/components/landing/Agents";
import { LookingGlass } from "@/components/landing/LookingGlass";
import { Verification } from "@/components/landing/Verification";
import { GitHubSection } from "@/components/landing/GitHubSection";
import { PoweredBy } from "@/components/landing/PoweredBy";
import { FinalCta, Footer } from "@/components/landing/FinalCta";

export default function Home() {
  return (
    <div className="bg-atmosphere min-h-screen overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Why />
        <HowItWorks />
        <Agents />
        <LookingGlass />
        <Verification />
        <GitHubSection />
        <PoweredBy />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
