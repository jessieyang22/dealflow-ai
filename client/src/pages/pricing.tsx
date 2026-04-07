import { useState } from "react";
import { Check, Zap, Building2, Users, Lock, ArrowRight, Star } from "lucide-react";
import { useAuth } from "@/lib/auth";
import AuthModal from "@/components/AuthModal";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "",
    tagline: "Get started, no card required",
    cta: "Start for Free",
    ctaVariant: "outline" as const,
    color: "border-border",
    features: [
      "2 deal analyses (no login)",
      "M&A fit score (0–100)",
      "Basic EV range",
      "Public deal history",
      "Share analysis links",
    ],
    locked: [
      "Deal Assessment Memo",
      "Bulk Screener (5 targets)",
      "Precedent Transactions DB",
      "Sector-specific analysis",
      "PDF export",
      "Pipeline tracker",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    period: "/ month",
    tagline: "For analysts and associates",
    cta: "Start Pro",
    ctaVariant: "default" as const,
    color: "border-primary",
    badge: "Most Popular",
    features: [
      "Unlimited deal analyses",
      "Deal Assessment Memo generator",
      "Bulk Screener (up to 5 targets)",
      "22 Precedent Transactions (6 sectors)",
      "All 6 sector modes",
      "PDF export — attach to interviews",
      "Deal Pipeline tracker (kanban)",
      "Comparable company screen",
      "Live market data (yfinance)",
      "Share + history (50 analyses)",
      "Priority support",
    ],
    locked: [],
  },
  {
    id: "teams",
    name: "Teams",
    price: 99,
    period: "/ month",
    tagline: "For small teams and funds",
    cta: "Start Teams",
    ctaVariant: "outline" as const,
    color: "border-border",
    features: [
      "Everything in Pro",
      "Up to 5 seats included",
      "Shared pipeline & analyses",
      "Admin dashboard + traction metrics",
      "Team watchlist sync",
      "Bulk Screener (10 targets)",
      "Custom sector prompts",
      "CSV/Excel export",
      "Slack integration (coming soon)",
      "Dedicated onboarding call",
    ],
    locked: [],
  },
];

const FAQS = [
  {
    q: "Who is DealFlow AI built for?",
    a: "Investment banking analysts and associates, PE/VC associates, corporate development teams, and finance students who want IB-quality deal screening without a Bloomberg Terminal.",
  },
  {
    q: "How accurate is the valuation analysis?",
    a: "DealFlow AI uses Claude — the same underlying model tier used in enterprise finance tools — with sector-specific prompts calibrated to real bulge bracket methodology (EV/EBITDA, EV/Revenue, precedent transaction comps, LBO analysis). It's a screening tool, not a fairness opinion.",
  },
  {
    q: "Can I export analyses for interviews?",
    a: "Yes. Pro users can export any analysis as a PDF with a navy header, score ring, radar chart, and full IB-formatted output. Designed to attach to your resume or bring to an interview.",
  },
  {
    q: "What's the Bulk Screener?",
    a: "Upload up to 5 companies simultaneously and DealFlow ranks them by fit score in parallel — ideal for building a target universe or comparing acquisition candidates for a pitch book.",
  },
  {
    q: "Is there a free trial for Pro?",
    a: "The Free tier gives you 2 full analyses to experience the product. Pro unlocks immediately on signup — no credit card required to explore the Free tier.",
  },
  {
    q: "How does Teams billing work?",
    a: "Teams is $99/month for up to 5 seats. Additional seats are $15/seat/month. Annual billing (2 months free) is available — contact us.",
  },
];

export default function PricingPage() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [showAuth, setShowAuth] = useState(false);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const currentPlan = (user as any)?.plan || "free";

  const handleCta = async (planId: string) => {
    if (planId === "free") {
      window.location.hash = "#/analyze";
      return;
    }
    if (!user) {
      setShowAuth(true);
      return;
    }
    if (currentPlan === planId) {
      toast({ title: "You're already on this plan" });
      return;
    }
    setUpgrading(planId);
    try {
      await apiRequest("POST", "/api/auth/upgrade", { plan: planId });
      toast({
        title: `Upgraded to ${planId.charAt(0).toUpperCase() + planId.slice(1)}`,
        description: "All features are now unlocked.",
      });
      // Reload to update user object
      window.location.reload();
    } catch (e: any) {
      toast({ title: "Upgrade failed", description: e.message, variant: "destructive" });
    } finally {
      setUpgrading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="max-w-5xl mx-auto px-6 pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-5">
          <Zap className="w-3 h-3" />
          Institutional-grade M&amp;A intelligence
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">
          Simple, transparent pricing
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto text-sm">
          Built for finance professionals who need IB-quality deal screening without a $27,000 Bloomberg Terminal.
          Start free, upgrade when you need more.
        </p>
      </div>

      {/* Plans */}
      <div className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const isCurrentPlan = currentPlan === plan.id;
            const isPro = plan.id === "pro";
            return (
              <div
                key={plan.id}
                className={`relative rounded-xl border-2 ${plan.color} bg-card p-6 flex flex-col ${
                  isPro ? "shadow-lg shadow-primary/10" : ""
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current" />
                      {plan.badge}
                    </span>
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute -top-3 right-4">
                    <span className="bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Current plan
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-1">
                    {plan.id === "free" && <Zap className="w-4 h-4 text-muted-foreground" />}
                    {plan.id === "pro" && <Building2 className="w-4 h-4 text-primary" />}
                    {plan.id === "teams" && <Users className="w-4 h-4 text-muted-foreground" />}
                    <span className={`font-semibold ${isPro ? "text-primary" : "text-foreground"}`}>
                      {plan.name}
                    </span>
                  </div>
                  <div className="flex items-end gap-1 mb-1">
                    <span className="text-3xl font-bold text-foreground">
                      {plan.price === 0 ? "Free" : `$${plan.price}`}
                    </span>
                    {plan.period && (
                      <span className="text-muted-foreground text-sm mb-1">{plan.period}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{plan.tagline}</p>
                </div>

                <button
                  onClick={() => handleCta(plan.id)}
                  disabled={upgrading === plan.id || isCurrentPlan}
                  className={`w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors mb-5 ${
                    isPro
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-border hover:bg-muted"
                  } disabled:opacity-50`}
                >
                  {upgrading === plan.id ? (
                    <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  ) : isCurrentPlan ? (
                    "Current plan"
                  ) : (
                    <>
                      {plan.cta}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>

                <div className="flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span className="text-foreground">{f}</span>
                    </div>
                  ))}
                  {plan.locked.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-sm">
                      <Lock className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground/50">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Enterprise callout */}
        <div className="mt-8 rounded-xl border border-border bg-muted/30 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-foreground mb-1">Enterprise / Funds</div>
            <p className="text-sm text-muted-foreground">
              Custom deployments for PE funds, bulge bracket teams, and corporate development groups.
              SSO, audit logs, API access, and white-label options available.
            </p>
          </div>
          <a
            href="mailto:yangjessie7@gmail.com"
            className="shrink-0 px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            Contact Sales
          </a>
        </div>
      </div>

      {/* Social proof strip */}
      <div className="border-y border-border bg-muted/20 py-8">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs text-muted-foreground uppercase tracking-wider mb-6 font-medium">
            Trusted by analysts at
          </p>
          <div className="flex flex-wrap justify-center gap-8 text-sm font-semibold text-muted-foreground/60">
            {["Goldman Sachs", "JPMorgan", "Morgan Stanley", "Blackstone", "KKR", "Thoma Bravo"].map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Feature comparison table */}
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-xl font-bold text-center text-foreground mb-8">Full feature comparison</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Feature</th>
                {PLANS.map((p) => (
                  <th key={p.id} className={`px-5 py-3 font-semibold text-center ${p.id === "pro" ? "text-primary" : "text-foreground"}`}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ["Deal analyses", "2 / session", "Unlimited", "Unlimited"],
                ["Fit score (0–100)", "✓", "✓", "✓"],
                ["EV range + multiples", "✓", "✓", "✓"],
                ["Sector modes", "1 (General)", "6 sectors", "6 + custom"],
                ["Radar chart", "✓", "✓", "✓"],
                ["Deal Assessment Memo", "—", "✓", "✓"],
                ["PDF export", "—", "✓", "✓"],
                ["Bulk Screener", "—", "5 targets", "10 targets"],
                ["Precedent transactions", "—", "22 deals", "22 + custom"],
                ["Comparable company screen", "—", "✓", "✓"],
                ["Live market data", "—", "✓", "✓"],
                ["Pipeline tracker (kanban)", "—", "✓", "✓"],
                ["Share analysis links", "✓", "✓", "✓"],
                ["Team seats", "—", "—", "5 included"],
                ["Admin dashboard", "—", "—", "✓"],
                ["CSV/Excel export", "—", "—", "✓"],
                ["Priority support", "—", "Email", "Dedicated"],
              ].map(([feature, free, pro, teams]) => (
                <tr key={feature} className="hover:bg-muted/20">
                  <td className="px-5 py-3 text-foreground font-medium">{feature}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{free}</td>
                  <td className="px-5 py-3 text-center text-primary font-medium">{pro}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{teams}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-6 pb-20">
        <h2 className="text-xl font-bold text-center text-foreground mb-8">Frequently asked questions</h2>
        <div className="divide-y divide-border">
          {FAQS.map((faq, i) => (
            <div key={i}>
              <button
                className="w-full text-left py-4 flex items-center justify-between gap-4"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span className="font-medium text-foreground text-sm">{faq.q}</span>
                <span className="text-muted-foreground text-lg shrink-0">
                  {openFaq === i ? "−" : "+"}
                </span>
              </button>
              {openFaq === i && (
                <p className="text-sm text-muted-foreground pb-4 leading-relaxed">{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} defaultTab="signup" />}
    </div>
  );
}
