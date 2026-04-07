import { Link, useLocation } from "wouter";
import { BarChart3, LayoutDashboard, LineChart, GitCompare, TrendingUp, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// ── Logo ──────────────────────────────────────────────────────────────────────
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="DealFlow AI"
      className="flex-shrink-0"
    >
      <rect width="32" height="32" rx="6" fill="currentColor" className="text-primary" />
      <path
        d="M8 22 L13 14 L18 18 L23 10"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="23" cy="10" r="2" fill="white" />
    </svg>
  );
}

// ── Nav Links ─────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { href: "/analyze", label: "Analyzer", icon: BarChart3 },
  { href: "/pipeline", label: "Pipeline", icon: LayoutDashboard },
  { href: "/comps", label: "Comps", icon: GitCompare },
  { href: "/market", label: "Market Data", icon: TrendingUp },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <Logo />
            <div>
              <span className="font-bold text-sm tracking-tight">DealFlow</span>
              <span className="text-primary text-xs font-semibold ml-1">AI</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1" role="navigation">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const active = location === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  data-testid={`nav-${label.toLowerCase()}`}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-2">
            <Link
              href="/analyze"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              data-testid="nav-run-analysis"
            >
              <BarChart3 size={12} />
              Run Analysis
            </Link>
            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-1.5 rounded-md hover:bg-muted"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <div className="md:hidden border-t bg-card px-4 py-3 space-y-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const active = location === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Page Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t bg-card/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            DealFlow AI — for informational purposes only. Not investment advice.
          </p>
          <p className="text-xs text-muted-foreground">Powered by Claude AI</p>
        </div>
      </footer>
    </div>
  );
}
