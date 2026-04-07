import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, getAuthToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, GraduationCap, Users, TrendingUp, ArrowRight, Sparkles } from "lucide-react";

const ROLES = [
  {
    id: "analyst",
    label: "Analyst",
    description: "IB or PE analyst — building deal screens and memos",
    icon: BarChart3,
    color: "text-blue-500",
    bg: "border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10",
    active: "border-blue-500 bg-blue-500/10",
  },
  {
    id: "associate",
    label: "Associate",
    description: "Running live deal processes and comps analysis",
    icon: TrendingUp,
    color: "text-green-500",
    bg: "border-green-500/20 bg-green-500/5 hover:bg-green-500/10",
    active: "border-green-500 bg-green-500/10",
  },
  {
    id: "vp",
    label: "VP / Director",
    description: "Overseeing deal origination and portfolio management",
    icon: Users,
    color: "text-purple-500",
    bg: "border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10",
    active: "border-purple-500 bg-purple-500/10",
  },
  {
    id: "student",
    label: "Student / Aspiring",
    description: "Learning deal analysis, prepping for IB recruiting",
    icon: GraduationCap,
    color: "text-amber-500",
    bg: "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10",
    active: "border-amber-500 bg-amber-500/10",
  },
];

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (!selected) return;
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ role: selected }),
      });
      if (!res.ok) throw new Error("Failed to save role");
      toast({
        title: "Welcome to DealFlow",
        description: `Workspace personalized for ${ROLES.find(r => r.id === selected)?.label || selected}.`,
      });
      onClose();
    } catch {
      // Silently close — onboarding is non-critical
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden" data-testid="onboarding-modal">
        {/* Header */}
        <div className="bg-primary px-6 py-5 text-primary-foreground">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-primary-foreground/70" />
            <span className="text-xs font-medium opacity-70 uppercase tracking-widest">One quick step</span>
          </div>
          <DialogTitle className="text-xl font-bold text-primary-foreground">
            Welcome, {user?.name?.split(" ")[0] || "Analyst"}
          </DialogTitle>
          <DialogDescription className="text-sm text-primary-foreground/70 mt-0.5">
            Tell us your role so we can tailor the experience to your workflow.
          </DialogDescription>
        </div>

        <div className="px-6 py-5 space-y-3">
          {ROLES.map(role => {
            const isActive = selected === role.id;
            return (
              <button
                key={role.id}
                onClick={() => setSelected(role.id)}
                className={`w-full flex items-center gap-4 p-3.5 rounded-lg border transition-all text-left ${isActive ? role.active : role.bg} border`}
                data-testid={`onboarding-role-${role.id}`}
              >
                <div className={`w-9 h-9 rounded-lg bg-background flex items-center justify-center flex-shrink-0`}>
                  <role.icon size={17} className={role.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{role.label}</span>
                    {isActive && <Badge className="text-[10px] h-4 px-1.5">Selected</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{role.description}</p>
                </div>
              </button>
            );
          })}

          <div className="pt-2 flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs flex-1 text-muted-foreground"
            >
              Skip for now
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selected || loading}
              className="flex-1 font-semibold gap-1.5"
              data-testid="onboarding-confirm"
            >
              {loading ? "Saving..." : <>Get started <ArrowRight size={13} /></>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
