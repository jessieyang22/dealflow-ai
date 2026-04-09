import { Link, useLocation } from "wouter";
import {
  BarChart3, LayoutDashboard, GitCompare, TrendingUp,
  Menu, X, User, LogOut, Shield, Search, DollarSign,
  ChevronDown, Zap, Calculator, BarChart2, Layers,
  ArrowLeftRight, Merge, Radio, FolderOpen, CalendarDays,
  FlaskConical, Newspaper, BookOpen,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import AuthModal from "@/components/AuthModal";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
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

// ── Nav Groups ────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Analyzer",
    href: "/analyze",
    icon: BarChart3,
    single: true,
  },
  {
    label: "Models",
    icon: Calculator,
    single: false,
    items: [
      { href: "/dcf",            label: "DCF Model",        icon: BarChart2,      desc: "5-yr FCF → implied price" },
      { href: "/lbo",            label: "LBO Calculator",   icon: Calculator,     desc: "IRR / MOIC across scenarios" },
      { href: "/football-field", label: "Football Field",   icon: Layers,         desc: "Bear / Base / Bull valuation" },
      { href: "/merger-model",   label: "Merger Model",     icon: Merge,          desc: "Combined P&L + EPS impact" },
      { href: "/accretion",      label: "Accretion/Dilution", icon: ArrowLeftRight, desc: "EPS impact by consideration mix" },
      { href: "/synergies",      label: "Synergy Calc",     icon: GitCompare,     desc: "Rev + cost synergies + NPV" },
    ],
  },
  {
    label: "Deal Tools",
    icon: FolderOpen,
    single: false,
    items: [
      { href: "/deal-room",  label: "Deal Room",    icon: FolderOpen,     desc: "Workspace per named deal" },
      { href: "/pipeline",   label: "Pipeline",     icon: LayoutDashboard,desc: "Kanban from screen → close" },
      { href: "/screener",   label: "Screener",     icon: Search,         desc: "Score up to 5 targets at once" },
      { href: "/comps",      label: "Comps",        icon: GitCompare,     desc: "Side-by-side company analysis" },
    ],
  },
  {
    label: "Research",
    icon: Newspaper,
    single: false,
    items: [
      { href: "/deal-wire",   label: "Deal Wire",    icon: Radio,         desc: "Live M&A headlines" },
      { href: "/earnings",    label: "Earnings",     icon: CalendarDays,  desc: "EPS calendar + beat/miss" },
      { href: "/market",      label: "Market Data",  icon: TrendingUp,    desc: "Live fundamentals by ticker" },
      { href: "/precedents",  label: "Precedents",   icon: DollarSign,    desc: "22 real M&A comps" },
    ],
  },
];

// All links flattened — for mobile
const ALL_LINKS = NAV_GROUPS.flatMap(g =>
  g.single ? [{ href: g.href!, label: g.label, icon: g.icon }]
  : g.items!.map(i => ({ href: i.href, label: i.label, icon: i.icon }))
);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");
  const { user, logout } = useAuth();

  const openSignup = () => { setAuthTab("signup"); setAuthOpen(true); };
  const openLogin  = () => { setAuthTab("login");  setAuthOpen(true); };

  // Is location inside this group?
  const groupActive = (g: typeof NAV_GROUPS[0]) => {
    if (g.single) return location === g.href;
    return g.items!.some(i => location === i.href);
  };

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

          {/* Desktop Nav — grouped dropdowns */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {NAV_GROUPS.map(group => {
              const active = groupActive(group);
              if (group.single) {
                return (
                  <Link key={group.href} href={group.href!}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                    data-testid={`nav-${group.label.toLowerCase()}`}
                  >
                    <group.icon size={13} />{group.label}
                  </Link>
                );
              }
              return (
                <DropdownMenu key={group.label}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                      data-testid={`nav-group-${group.label.toLowerCase()}`}
                    >
                      <group.icon size={13} />
                      {group.label}
                      <ChevronDown size={10} className="ml-0.5 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60 p-1.5">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 pb-1">
                      {group.label}
                    </DropdownMenuLabel>
                    {group.items!.map(item => {
                      const itemActive = location === item.href;
                      return (
                        <DropdownMenuItem key={item.href} asChild>
                          <Link href={item.href}
                            className={cn(
                              "flex items-start gap-2.5 px-2 py-2 rounded-md cursor-pointer",
                              itemActive && "bg-primary/10"
                            )}
                          >
                            <item.icon size={13} className={cn("mt-0.5 flex-shrink-0", itemActive ? "text-primary" : "text-muted-foreground")} />
                            <div>
                              <p className={cn("text-xs font-medium leading-none mb-0.5", itemActive && "text-primary")}>{item.label}</p>
                              <p className="text-[10px] text-muted-foreground leading-snug">{item.desc}</p>
                            </div>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>

          {/* Right — Auth */}
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
          <div className="lg:hidden border-t bg-card px-4 py-3 space-y-1 max-h-[80vh] overflow-y-auto">
            {NAV_GROUPS.map(group => (
              <div key={group.label}>
                {group.single ? (
                  <Link href={group.href!} onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      location === group.href ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <group.icon size={15} />{group.label}
                  </Link>
                ) : (
                  <>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 pt-3 pb-1 font-semibold">{group.label}</p>
                    {group.items!.map(item => (
                      <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                          location === item.href ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <item.icon size={15} />{item.label}
                      </Link>
                    ))}
                  </>
                )}
              </div>
            ))}
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
