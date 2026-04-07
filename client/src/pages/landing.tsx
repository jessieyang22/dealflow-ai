import { useState } from "react";
import { Link } from "wouter";
import {
  BarChart3, TrendingUp, GitCompare, LayoutDashboard,
  ArrowRight, Shield, Zap, Brain, CheckCircle, LineChart,
  DollarSign, Target, Mail,
} from "lucide-react";
import { Logo } from "@/components/AppLayout";
import WaitlistModal from "@/components/WaitlistModal";

const FEATURES = [
  {
    icon: BarChart3,
    title: "AI-Powered M&A Analysis",
    desc: "Input any company's financials and receive a comprehensive deal assessment — fit score, EV range, synergy analysis, LBO viability, and a banker's verdict. Powered by Claude.",
    href: "/analyze",
    cta: "Run Analysis",
  },
  {
    icon: LayoutDashboard,
    title: "Deal Pipeline Tracker",
    desc: "Manage your M&A pipeline from first screen to LOI. Track deals by stage (Screening → Diligence → Negotiation → Closed) with priority flags and notes.",
    href: "/pipeline",
    cta: "View Pipeline",
  },
  {
    icon: GitCompare,
    title: "Comparable Company Screen",
    desc: "Analyze multiple targets side-by-side. Compare fit scores, EV ranges, synergy potential, and LBO attractiveness across the entire deal universe.",
    href: "/comps",
    cta: "Run Comps",
  },
  {
    icon: TrendingUp,
    title: "Live Market Data",
    desc: "Pull real-time fundamentals for any public company — EV/EBITDA multiples, revenue growth, margins, 52-week range. Pre-populate the analysis form instantly.",
    href: "/market",
    cta: "Look Up Ticker",
  },
];

const METRICS = [
  { value: "0–100", label: "Fit Score", icon: Target },
  { value: "EV/EBITDA", label: "Valuation Range", icon: DollarSign },
  { value: "6 Sectors", label: "Sector Modes", icon: LineChart },
  { value: "Claude AI", label: "Bulge Bracket Logic", icon: Brain },
];

const SECTORS = [
  "SaaS / Cloud", "Healthcare / MedTech", "Industrials / Manufacturing",
  "FinTech / Financial", "Consumer / Brands", "Energy / Infrastructure",
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Input Financials",
    desc: "Enter LTM Revenue, EBITDA, growth rate, and debt load — or pull live data from any public ticker.",
  },
  {
    step: "02",
    title: "Select Sector Mode",
    desc: "Choose from 6 sector-specific analysis modes. Each mode calibrates deal multiples and acquirer logic to the specific vertical.",
  },
  {
    step: "03",
    title: "Get Your Assessment",
    desc: "Receive a complete deal memo: fit score, EV range, synergy breakdown, LBO analysis, key risks, and a banker's verdict.",
  },
  {
    step: "04",
    title: "Export & Share",
    desc: "Download a professional PDF memo, share via unique URL, or add the target to your deal pipeline.",
  },
];

export default function Landing() {
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      {/* ── Top Nav ── */}
      <header className="border-b bg-card/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div>
              <span className="font-bold text-sm tracking-tight">DealFlow</span>
              <span className="text-primary text-xs font-semibold ml-1">AI</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/analyze"
              className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors font-medium px-3 py-1.5"
            >
              Analyzer
            </Link>
            <Link
              href="/pipeline"
              className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors font-medium px-3 py-1.5"
            >
              Pipeline
            </Link>
            <Link
              href="/market"
              className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors font-medium px-3 py-1.5"
            >
              Market Data
            </Link>
            <Link
              href="/analyze"
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              data-testid="hero-cta-primary"
            >
              <BarChart3 size={14} />
              Run Free Analysis
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-7xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 border border-primary/20">
          <Zap size={11} />
          Powered by Claude AI — Bulge Bracket Deal Logic
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-5">
          Institutional-Grade<br />
          <span className="text-primary">M&amp;A Intelligence</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
          AI-powered deal screening, valuation analysis, and pipeline management.
          Fit scores, EV ranges, synergy frameworks, and LBO assessments — in seconds.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/analyze"
            className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            data-testid="hero-cta"
          >
            <BarChart3 size={15} />
            Analyze a Target
            <ArrowRight size={14} />
          </Link>
          <button
            onClick={() => setWaitlistOpen(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium border hover:bg-muted transition-colors"
            data-testid="hero-waitlist-btn"
          >
            <Mail size={15} />
            Join Waitlist
          </button>
        </div>
      </section>

      {/* ── Metrics Strip ── */}
      <section className="border-y bg-card/50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {METRICS.map(({ value, label, icon: Icon }) => (
              <div key={label} className="text-center">
                <Icon size={20} className="text-primary mx-auto mb-2" />
                <div className="text-xl font-bold mono text-foreground">{value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold tracking-tight mb-2">Everything You Need</h2>
          <p className="text-sm text-muted-foreground">Full M&A workflow — from first screen to pipeline management.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, href, cta }) => (
            <div
              key={title}
              className="rounded-xl border bg-card p-6 hover:border-primary/30 hover:shadow-sm transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Icon size={17} className="text-primary" />
              </div>
              <h3 className="font-semibold text-sm mb-2">{title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">{desc}</p>
              <Link
                href={href}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {cta} <ArrowRight size={11} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sector Modes ── */}
      <section className="border-y bg-card/30">
        <div className="max-w-7xl mx-auto px-6 py-12 text-center">
          <h2 className="text-xl font-bold tracking-tight mb-2">Sector-Specific Analysis</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Each sector mode calibrates deal multiples, acquirer logic, and risk frameworks to the vertical.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {SECTORS.map((s) => (
              <span
                key={s}
                className="px-3 py-1.5 rounded-full text-xs font-medium border bg-card text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold tracking-tight mb-2">How It Works</h2>
          <p className="text-sm text-muted-foreground">Four steps from financials to deal memo.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {HOW_IT_WORKS.map(({ step, title, desc }) => (
            <div key={step} className="relative">
              <div className="text-3xl font-bold mono text-primary/20 mb-3">{step}</div>
              <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t bg-card/50">
        <div className="max-w-7xl mx-auto px-6 py-14 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Shield size={14} className="text-primary" />
            <span className="text-xs text-muted-foreground font-medium">2 free analyses · No account required</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-3">Ready to analyze your first deal?</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Input any company's financials and get a full M&A assessment in under 30 seconds.
          </p>
          <Link
            href="/analyze"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            data-testid="footer-cta"
          >
            <BarChart3 size={15} />
            Start Analyzing
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      <WaitlistModal open={waitlistOpen} onClose={() => setWaitlistOpen(false)} source="landing" />

      {/* Footer */}
      <footer className="border-t">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={20} />
            <span className="text-xs font-semibold">DealFlow AI</span>
          </div>
          <p className="text-xs text-muted-foreground">
            For informational purposes only. Not investment advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
