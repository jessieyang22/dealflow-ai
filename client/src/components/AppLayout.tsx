import { Link, useLocation } from "wouter";
import {
  BarChart3, LayoutDashboard, GitCompare, TrendingUp,
  Menu, X, User, LogOut, Shield, Search, DollarSign,
  ChevronDown, Zap, Calculator, BarChart2, Layers,
  ArrowLeftRight, Merge, Radio,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import AuthModal from "@/components/AuthModal";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Logo ──────────────────────────────────────────────────────────────────────
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
      aria-label="DealFlow AI" className="flex-shrink-0">
      <rect width="32" height="32" rx="6" fill="currentColor" className="text-primary" />
      <path d="M8 22 L13 14 L18 18 L23 10" stroke="white" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="23" cy="10" r="2" fill="white" />
    </svg>
  );
}

// ── Nav Links ─────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { href: "/analyze",        label: "Analyzer",      icon: BarChart3 },
  { href: "/screener",       label: "Screener",      icon: Search },
  { href: "/lbo",            label: "LBO Calc",      icon: Calculator },
  { href: "/dcf",            label: "DCF",           icon: BarChart2 },
  { href: "/football-field", label: "Football Field", icon: Layers },
  { href: "/pipeline",       label: "Pipeline",      icon: LayoutDashboard },
  { href: "/comps",          label: "Comps",         icon: GitCompare },
  { href: "/precedents",     label: "Precedents",    icon: DollarSign },
  { href: "/market",         label: "Market",        icon: TrendingUp },
  { href: "/accretion",      label: "Accretion",     icon: ArrowLeftRight },
  { href: "/synergies",      label: "Synergies",     icon: Merge },
  { href: "/deal-wire",      label: "Deal Wire",     icon: Radio },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");
  const { user, logout } = useAuth();

  const openSignup = () => { setAuthTab("signup"); setAuthOpen(true); };
  const openLogin  = () => { setAuthTab("login");  setAuthOpen(true); };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <Logo />
            <div className="flex items-center gap-1">
              <span className="font-bold text-sm tracking-tight">DealFlow</span>
              <span className="text-primary text-xs font-semibold">AI</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const active = location === href;
              return (
                <Link key={href} href={href}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
                >
                  <Icon size={13} />{label}
                </Link>
              );
            })}
          </nav>

          {/* Right — Plan badge + Auth */}
          <div className="flex items-center gap-2">


            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium hover:bg-muted transition-colors"
                    data-testid="nav-user-menu"
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <User size={12} className="text-primary" />
                    </div>
                    <span className="hidden sm:block text-xs">{user.name?.split(" ")[0] || user.email.split("@")[0]}</span>
                    <ChevronDown size={11} className="text-muted-foreground hidden sm:block" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-3 py-2">
                    <p className="text-xs font-medium truncate">{user.email}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {user.analysesRun !== undefined && (
                        <span className="text-[10px] text-muted-foreground">{user.analysesRun} analyses run</span>
                      )}
                    </div>
                  </div>
                  <DropdownMenuSeparator />

                  {(user.role === "admin" || user.email === "yangjessie7@gmail.com") && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="flex items-center gap-2 cursor-pointer">
                          <Shield size={13} />Admin Dashboard
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={logout}
                    className="text-muted-foreground flex items-center gap-2 cursor-pointer"
                    data-testid="nav-logout"
                  >
                    <LogOut size={13} />Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <button
                  onClick={openLogin}
                  className="hidden sm:block text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
                  data-testid="nav-login"
                >
                  Sign in
                </button>
                <button
                  onClick={openSignup}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  data-testid="nav-signup"
                >
                  <BarChart3 size={12} />Get Started
                </button>
              </>
            )}
            {/* Mobile menu toggle */}
            <button className="lg:hidden p-1.5 rounded-md hover:bg-muted" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <div className="lg:hidden border-t bg-card px-4 py-3 space-y-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const active = location === href;
              return (
                <Link key={href} href={href} onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon size={15} />{label}
                </Link>
              );
            })}
            <Link href="/pricing" onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Zap size={15} />Pricing
            </Link>
            {!user && (
              <button onClick={() => { setMobileOpen(false); openSignup(); }}
                className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
                <User size={15} />Create Account
              </button>
            )}
          </div>
        )}
      </header>

      {/* Page Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t bg-card/50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <p className="text-xs text-muted-foreground">© 2026 DealFlow AI — Not investment advice.</p>
            <Link href="/precedents" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Precedents</Link>
          </div>
          <p className="text-xs text-muted-foreground">Powered by Claude AI · Built for finance professionals</p>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultTab={authTab} />
    </div>
  );
}
