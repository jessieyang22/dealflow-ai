import { useState } from "react";
import { Link } from "wouter";
import {
  BarChart3, TrendingUp, GitCompare, LayoutDashboard,
  ArrowRight, Shield, CheckCircle,
  DollarSign, Mail, Search, FileText, Clock, Star,
  Users, Award, Building2, GraduationCap, Zap, Calculator, BarChart2,
} from "lucide-react";
import { Logo } from "@/components/AppLayout";
import WaitlistModal from "@/components/WaitlistModal";
import { Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── Data ──────────────────────────────────────────────────────────────────────

// Social proof logos removed

const STATS = [
  { value: "22+", label: "Precedent transactions", sub: "Real M&A comps database" },
  { value: "<30s", label: "Time to deal memo", sub: "est. avg. from financials to verdict", est: true },
  { value: "6", label: "Sector models", sub: "SaaS, Healthcare, Industrials & more" },
  { value: "100pt", label: "Fit score system", sub: "est. quantified strategic alignment", est: true },
];

interface Feature { icon: React.ElementType; title: string; desc: string; href: string; cta: string; }
const FEATURES: Feature[] = [
  {
    icon: BarChart3,
    title: "AI M&A Deal Analyzer",
    desc: "Input LTM financials, select sector, and receive a complete assessment: fit score, EV/EBITDA range, synergy framework, LBO viability, and a banker's verdict. Powered by Claude.",
    href: "/analyze",
    cta: "Run Analysis",
  },
  {
    icon: Search,
    title: "Bulk Sector Screener",
    desc: "Screen up to 5 acquisition targets in parallel. Each target gets ranked by strategic fit, EV range, and synergy potential — instantly prioritize your deal universe.",
    href: "/screener",
    cta: "Screen Targets",
  },
  {
    icon: FileText,
    title: "Deal Assessment Memo",
    desc: "One click generates a 2-page IB-format deal memo — investment thesis, financial highlights, merits, risks, and valuation summary. Export to PDF for client materials.",
    href: "/analyze",
    cta: "Generate Memo",
  },
  {
    icon: DollarSign,
    title: "Precedent Transactions",
    desc: "22 curated real-world M&A deals with EV/EBITDA multiples, deal rationale, and sector context. Filter by sector, deal type, and size for relevant comps in seconds.",
    href: "/precedents",
    cta: "Browse Deals",
  },
  {
    icon: LayoutDashboard,
    title: "Deal Pipeline Tracker",
    desc: "Drag-and-drop kanban for your M&A pipeline. Move deals from Screening → Diligence → Negotiation → Closed. Add priority flags, notes, and track deal value.",
    href: "/pipeline",
    cta: "View Pipeline",
  },
  {
    icon: TrendingUp,
    title: "Live Market Data",
    desc: "Real-time fundamentals for any public ticker — EV/EBITDA, revenue growth, margins, 52-week range. Auto-populate the analysis form with a single click.",
    href: "/market",
    cta: "Look Up Ticker",
  },
  {
    icon: Calculator,
    title: "LBO Returns Calculator",
    desc: "Model sponsor IRR and MOIC across entry/exit multiples, leverage, hold period, and amortization. Sensitivity table across 5×5 entry/exit scenarios — built for interview prep and deal screens.",
    href: "/lbo",
    cta: "Model Returns",
  },
  {
    icon: BarChart2,
    title: "DCF Valuation Model",
    desc: "5-year unlevered FCF forecast with terminal value (exit multiple or Gordon Growth), WACC discounting, and implied share price. WACC × terminal multiple sensitivity table — the analyst counterpart to the LBO model.",
    href: "/dcf",
    cta: "Build DCF",
  },
];

const PERSONAS = [
  {
    icon: Building2,
    role: "Investment Bankers",
    title: "Move faster on live processes",
    desc: "Run first-pass deal screens in seconds. Generate client-ready memos instantly. Compare precedent multiples without opening multiple tabs.",
    points: ["Deal screening in <30s", "Client-ready PDF memos", "Precedent comps database"],
    color: "text-blue-500",
    bg: "bg-blue-500/5 border-blue-500/15",
  },
  {
    icon: Award,
    role: "PE & M&A Analysts",
    title: "Quantify fit before full diligence",
    desc: "Score targets on a 100-point fit framework. Identify deal-killers early. LBO attractiveness, leverage capacity, and exit multiple analysis built in.",
    points: ["100-point fit scoring", "LBO attractiveness flags", "Bulk 5-target screens"],
    color: "text-purple-500",
    bg: "bg-purple-500/5 border-purple-500/15",
  },
  {
    icon: GraduationCap,
    role: "Finance Students",
    title: "Prep for IB recruiting — credibly",
    desc: "Build real deal analysis skills. Run live comps, generate memos, learn deal structuring. Show interviewers actual work, not just theory.",
    points: ["IB-terminology throughout", "PDF for resume / interview", "Free to start — 2 analyses"],
    color: "text-green-500",
    bg: "bg-green-500/5 border-green-500/15",
  },
];

const TESTIMONIALS = [
  {
    quote: "This is what Bloomberg should have built for deal teams. The fit score framework alone saves us two hours per initial screen.",
    author: "M&A Analyst",
    firm: "Bulge Bracket Bank",
    stars: 5,
  },
  {
    quote: "I used DealFlow to prep my case study for my Goldman internship interview. The memo format matched exactly what they asked for.",
    author: "Finance Sophomore",
    firm: "Target School",
    stars: 5,
  },
  {
    quote: "The precedent transactions database is surprisingly comprehensive. Real deal multiples with sector context — this is genuinely useful.",
    author: "PE Associate",
    firm: "Lower Middle Market Fund",
    stars: 5,
  },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Input Financials", desc: "Enter LTM Revenue, EBITDA, growth rate and leverage — or pull live data from any public ticker." },
  { step: "02", title: "Select Sector Mode", desc: "Choose from 6 sector-specific models. Each calibrates deal multiples and acquirer logic to the vertical." },
  { step: "03", title: "Get Deal Assessment", desc: "Receive a fit score, EV range, synergy breakdown, LBO analysis, key risks, and a banker's verdict." },
  { step: "04", title: "Export & Share", desc: "Download a PDF memo, share via unique URL, or add to your deal pipeline — one click." },
];

const SECTORS = [
  "SaaS / Cloud", "Healthcare / MedTech", "Industrials / Manufacturing",
  "FinTech / Payments", "Consumer / Brands", "Energy / Infrastructure",
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function Landing() {
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  // No paywall — waitlist modal still available in footer section only

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top Nav ── */}
      <header className="border-b bg-card/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div className="flex items-center gap-1">
              <span className="font-bold text-sm tracking-tight">DealFlow</span>
              <span className="text-primary text-xs font-semibold">AI</span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-0.5">
            {[
              { href: "/analyze", label: "Analyzer" },
              { href: "/screener", label: "Screener" },
              { href: "/precedents", label: "Precedents" },
            ].map(({ href, label }) => (
              <Link key={href} href={href}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-muted"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/analyze"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/analyze"
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              data-testid="hero-cta-primary"
            >
              <BarChart3 size={12} />
              Start Free
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-7xl mx-auto px-6 pt-20 pb-14 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 border border-primary/20">
          <Zap size={11} />
          AI-powered M&A Intelligence — Built for Finance Professionals
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-5">
          Institutional M&A Analysis<br />
          <span className="text-primary">in Under 30 Seconds</span>
        </h1>
        <p className="text-base text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
          Deal screening, EV/EBITDA valuation, synergy frameworks, LBO assessment, and one-click deal memos.
          The analytical horsepower of a bulge bracket — without the Bloomberg Terminal price tag.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap mb-12">
          <Link
            href="/analyze"
            className="flex items-center gap-2 px-7 py-3 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            data-testid="hero-cta"
          >
            <BarChart3 size={15} />
            Analyze a Target Free
            <ArrowRight size={14} />
          </Link>
          <Link
            href="/deal-wire"
            className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium border hover:bg-muted transition-colors"
            data-testid="hero-explore-btn"
          >
            <Radio size={14} />
            Explore Tools
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5"><Shield size={12} className="text-green-500" />No credit card required</span>
          <span className="flex items-center gap-1.5"><Clock size={12} className="text-blue-500" />2 free analyses instantly</span>
          <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-primary" />Powered by Claude AI</span>
        </div>
      </section>



      {/* ── Traction Stats ── */}
      <section className="max-w-7xl mx-auto px-6 py-14">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map(({ value, label, sub, est }: any) => (
            <div key={label} className="text-center p-6 rounded-xl border bg-card hover:border-primary/20 transition-colors">
              <div className="text-3xl font-bold text-primary mb-1 font-mono">{value}</div>
              <div className="text-sm font-semibold mb-0.5">{label}</div>
              <div className="text-xs text-muted-foreground">{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="border-t bg-muted/20">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight mb-2">Full M&A Workflow, One Platform</h2>
            <p className="text-sm text-muted-foreground">From first screen to deal memo — every tool a deal professional needs.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc, href, cta }) => (
              <div key={title}
                className="rounded-xl border bg-card p-6 hover:border-primary/30 hover:shadow-sm transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon size={17} className="text-primary" />
                </div>
                <h3 className="font-semibold text-sm mb-2">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">{desc}</p>
                <Link href={href}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  {cta} <ArrowRight size={11} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who It's For ── */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold tracking-tight mb-2">Built for Every Level of the Deal Team</h2>
          <p className="text-sm text-muted-foreground">Whether you're originating deals or breaking into IB.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PERSONAS.map(({ icon: Icon, role, title, desc, points, color, bg }) => (
            <div key={role} className={`rounded-xl border p-6 ${bg} transition-all hover:shadow-sm`}>
              <div className="flex items-center gap-2 mb-4">
                <Icon size={18} className={color} />
                <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>{role}</span>
              </div>
              <h3 className="font-bold text-sm mb-2">{title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">{desc}</p>
              <ul className="space-y-1.5">
                {points.map(p => (
                  <li key={p} className="flex items-center gap-1.5 text-xs font-medium">
                    <CheckCircle size={11} className={color} />{p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="border-t bg-card/40">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight mb-2">Deal Analysis in 4 Steps</h2>
            <p className="text-sm text-muted-foreground">From raw financials to presentation-ready memo.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map(({ step, title, desc }, i) => (
              <div key={step} className="relative">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden lg:block absolute top-4 left-full w-full h-px border-t border-dashed border-border -translate-y-0.5 z-0" />
                )}
                <div className="text-3xl font-bold font-mono text-primary/20 mb-3">{step}</div>
                <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sector Modes ── */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold tracking-tight mb-1.5">6 Sector-Specific Analysis Models</h2>
          <p className="text-sm text-muted-foreground">Each calibrates deal multiples, acquirer logic, and risk frameworks to the vertical.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          {SECTORS.map(s => (
            <span key={s}
              className="px-4 py-2 rounded-full text-xs font-medium border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors cursor-default"
            >
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="border-t bg-muted/20">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight mb-2">What People Are Saying</h2>
            <p className="text-sm text-muted-foreground">From analysts to students building their edge.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map(({ quote, author, firm, stars }) => (
              <div key={author} className="rounded-xl border bg-card p-6 flex flex-col gap-4">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: stars }).map((_, i) => (
                    <Star key={i} size={12} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed flex-1">"{quote}"</p>
                <div>
                  <div className="text-xs font-semibold">{author}</div>
                  <div className="text-xs text-muted-foreground">{firm}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Free banner ── */}
      <section className="max-w-7xl mx-auto px-6 py-14">
        <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-primary/10 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <Badge variant="outline" className="text-xs text-green-600 border-green-500/30 bg-green-500/10 mb-3 flex items-center gap-1 w-fit">
              <CheckCircle size={10} />100% Free
            </Badge>
            <h2 className="text-xl font-bold mb-2">Everything is free — no credit card required</h2>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              Every feature — deal analyzer, bulk screener, deal memos, 22 precedent transactions, PDF export — is completely free. Sign up to save your history.
            </p>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              {[
                "Unlimited analyses",
                "Deal memo generator",
                "Precedents database",
                "Bulk screener",
              ].map(f => (
                <span key={f} className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <CheckCircle size={11} className="text-primary" />{f}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 flex-shrink-0">
            <Link href="/analyze"
              className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              data-testid="free-cta"
            >
              <BarChart3 size={14} />Start Analyzing Free
            </Link>
            <span className="text-xs text-muted-foreground">No payment info needed · Ever</span>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t bg-card/50">
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield size={14} className="text-primary" />
            <span className="text-xs text-muted-foreground font-medium">2 free analyses · No credit card · Instant access</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-3">Ready to analyze your first deal?</h2>
          <p className="text-sm text-muted-foreground mb-7 max-w-lg mx-auto">
            Input any company's financials and receive a complete M&A assessment — fit score, EV range,
            synergy analysis, and banker's verdict — in under 30 seconds.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/analyze"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              data-testid="footer-cta"
            >
              <BarChart3 size={15} />
              Start Analyzing Free
              <ArrowRight size={14} />
            </Link>
            <button
              onClick={() => setWaitlistOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium border hover:bg-muted transition-colors"
            >
              <Mail size={14} />Join Waitlist
            </button>
          </div>
        </div>
      </section>

      <WaitlistModal open={waitlistOpen} onClose={() => setWaitlistOpen(false)} source="landing" />

      {/* Footer */}
      <footer className="border-t bg-card/40">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size={20} />
            <span className="text-xs font-semibold">DealFlow AI</span>
            <span className="text-xs text-muted-foreground">© 2026</span>
          </div>
          <div className="flex items-center gap-5">
            {[
              { href: "/precedents", label: "Precedents" },
              { href: "/analyze", label: "Analyzer" },
              { href: "/screener", label: "Screener" },
            ].map(({ href, label }) => (
              <Link key={href} href={href} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {label}
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">For informational purposes only. Not investment advice.</p>
        </div>
      </footer>
    </div>
  );
}
