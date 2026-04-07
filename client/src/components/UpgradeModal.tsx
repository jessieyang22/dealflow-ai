import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAuthToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  Lock, Zap, FileText, Search, BarChart3, Users, CheckCircle2,
  TrendingUp, X, ArrowRight,
} from "lucide-react";
import { Link } from "wouter";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** What feature triggered the gate */
  feature?: string;
}

const PRO_FEATURES = [
  { icon: Zap,       label: "Unlimited analyses",              desc: "No session limits" },
  { icon: FileText,  label: "Deal Assessment Memos",           desc: "AI-drafted 2-page IB memos" },
  { icon: Search,    label: "Bulk Sector Screener",            desc: "Score 5 targets in parallel" },
  { icon: BarChart3, label: "22 Precedent Transactions",       desc: "Real M&A comps database" },
  { icon: TrendingUp,label: "All sectors + PDF export",        desc: "Download & share memos" },
];

const TEAMS_ADDS = [
  { icon: Users, label: "5 team seats", desc: "Shared pipeline & memos" },
  { icon: BarChart3, label: "10-target bulk screen", desc: "Larger deal universe" },
];

export default function UpgradeModal({ open, onClose, feature }: UpgradeModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleUpgrade(plan: "pro" | "teams") {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/auth/upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error("Upgrade failed");
      toast({
        title: `${plan === "pro" ? "Pro" : "Teams"} plan activated`,
        description: "All premium features are now unlocked. Refresh to apply.",
      });
      onClose();
      // In production this would redirect to Stripe. For now, refresh after brief delay.
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast({ title: "Upgrade unavailable", description: "Stripe integration coming soon — contact us directly.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden" data-testid="upgrade-modal">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X size={14} />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-br from-primary to-primary/80 px-6 py-6 text-primary-foreground">
          <div className="flex items-center gap-2 mb-2">
            <Lock size={14} className="text-primary-foreground/70" />
            {feature && (
              <span className="text-xs font-medium opacity-70">{feature} requires Pro</span>
            )}
          </div>
          <DialogTitle className="text-xl font-bold text-primary-foreground">
            Unlock DealFlow Pro
          </DialogTitle>
          <p className="text-sm text-primary-foreground/70 mt-1">
            Built for finance professionals — everything you need to move deals faster.
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Pro Features */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold">Pro — $29/month</span>
              <Badge className="text-xs bg-primary/10 text-primary border-primary/20 border">Most Popular</Badge>
            </div>
            <div className="space-y-2">
              {PRO_FEATURES.map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <f.icon size={13} className="text-primary" />
                  </div>
                  <div>
                    <span className="text-sm font-medium">{f.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{f.desc}</span>
                  </div>
                  <CheckCircle2 size={14} className="text-green-500 ml-auto flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>

          {/* Teams add-ons */}
          <div className="rounded-lg border p-3 bg-muted/30">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Teams — $99/mo (everything in Pro, plus)
            </div>
            <div className="space-y-1.5">
              {TEAMS_ADDS.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <f.icon size={12} className="text-muted-foreground" />
                  <span className="font-medium">{f.label}</span>
                  <span className="text-xs text-muted-foreground">— {f.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div className="space-y-2">
            <Button
              className="w-full font-bold gap-2"
              onClick={() => handleUpgrade("pro")}
              disabled={loading}
              data-testid="upgrade-pro-btn"
            >
              {loading ? "Processing..." : <><Zap size={14} />Upgrade to Pro — $29/mo</>}
            </Button>
            <Button
              variant="outline"
              className="w-full text-xs gap-2 text-muted-foreground"
              onClick={() => handleUpgrade("teams")}
              disabled={loading}
              data-testid="upgrade-teams-btn"
            >
              <Users size={13} />Teams plan — $99/mo
            </Button>
          </div>

          {/* Pricing page link */}
          <div className="text-center">
            <Link href="/pricing" onClick={onClose}>
              <button className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors inline-flex items-center gap-1">
                Compare all plans <ArrowRight size={10} />
              </button>
            </Link>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Cancel anytime · Stripe-secured · No hidden fees
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
