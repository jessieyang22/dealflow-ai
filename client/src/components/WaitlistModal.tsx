import { useState } from "react";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CheckCircle, Loader2, Zap } from "lucide-react";
import { Logo } from "@/components/AppLayout";

interface WaitlistModalProps {
  open: boolean;
  onClose: () => void;
  source?: string;
}

const ROLES = [
  { value: "student", label: "Finance / MBA Student" },
  { value: "analyst", label: "Investment Banking Analyst" },
  { value: "associate", label: "Associate / VP" },
  { value: "pe", label: "Private Equity" },
  { value: "bd", label: "Corporate Development" },
  { value: "other", label: "Other" },
];

export default function WaitlistModal({ open, onClose, source = "landing" }: WaitlistModalProps) {
  const [email, setEmail]     = useState("");
  const [name, setName]       = useState("");
  const [role, setRole]       = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ position: number; already?: boolean } | null>(null);
  const [error, setError]     = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim(), name, role, source }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Something went wrong");
      }
      const data = await res.json();
      setSuccess(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setEmail(""); setName(""); setRole("");
    setSuccess(null); setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        {success ? (
          /* ── Success State ── */
          <div className="px-6 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={22} className="text-emerald-500" />
            </div>
            <h2 className="font-bold text-base mb-1">
              {success.already ? "You're already on the list" : "You're on the list"}
            </h2>
            <p className="text-sm text-muted-foreground mb-1">
              {success.already
                ? `You're waitlist position #${success.position}. We'll be in touch.`
                : `Waitlist position #${success.position}. We'll email you when early access opens.`}
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              In the meantime, try the free analyzer — 2 analyses on us, no account required.
            </p>
            <Button onClick={handleClose} className="w-full gap-2">
              <Zap size={13} />Try the Analyzer
            </Button>
          </div>
        ) : (
          /* ── Form ── */
          <>
            <div className="bg-primary/5 border-b px-6 pt-6 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <Logo size={22} />
                <span className="font-bold text-sm">DealFlow AI</span>
                <span className="ml-auto text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                  Early Access
                </span>
              </div>
              <h2 className="font-bold text-base">Join the waitlist</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Get early access to unlimited analyses, saved pipelines, and team features.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-3">
              <div>
                <label className="text-xs font-medium">Email</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="mt-1"
                  data-testid="waitlist-email"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Name <span className="text-muted-foreground">(optional)</span></label>
                <Input
                  placeholder="First name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Role <span className="text-muted-foreground">(optional)</span></label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !email}
                data-testid="waitlist-submit"
              >
                {loading
                  ? <><Loader2 size={13} className="animate-spin mr-2" />Joining...</>
                  : "Join Waitlist"
                }
              </Button>
              <p className="text-xs text-center text-muted-foreground">No spam. Unsubscribe anytime.</p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
