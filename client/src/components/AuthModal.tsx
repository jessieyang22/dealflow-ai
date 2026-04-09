import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, BarChart3 } from "lucide-react";
import { Logo } from "@/components/AppLayout";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  /** Why the modal was triggered */
  trigger?: "gate" | "nav" | "waitlist-convert";
  defaultTab?: "login" | "signup";
}

export default function AuthModal({ open, onClose, trigger = "nav", defaultTab = "signup" }: AuthModalProps) {
  const { login, signup, isLoading } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<"login" | "signup">(defaultTab);
  const [email, setEmail]       = useState("");
  const [name, setName]         = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");

  const reset = () => { setEmail(""); setName(""); setPassword(""); setError(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (tab === "login") {
        await login(email, password);
      } else {
        await signup(email, name, password);
      }
      toast({
        title: tab === "signup" ? "Account created" : "Welcome back",
        description: tab === "signup" ? "You're in — your analyses are now saved." : `Signed in as ${email}`,
      });
      reset();
      onClose();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    }
  };

  const gateMessage = trigger === "gate"
    ? "You've used your 2 free analyses. Create a free account to run unlimited analyses and save your deal history."
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-primary/5 border-b px-6 pt-6 pb-5">
          <div className="flex items-center gap-2 mb-3">
            <Logo size={22} />
            <span className="font-bold text-sm">DealFlow AI</span>
          </div>
          {gateMessage && (
            <div className="flex items-start gap-2 mb-3 rounded-lg bg-primary/10 border border-primary/20 p-3">
              <Lock size={13} className="text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-primary leading-relaxed">{gateMessage}</p>
            </div>
          )}
          {/* Tabs */}
          <div className="flex rounded-lg border bg-muted p-0.5 gap-0.5">
            {(["signup", "login"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  tab === t
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "signup" ? "Create Account" : "Sign In"}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-3">
          {tab === "signup" && (
            <div>
              <label className="text-xs font-medium">Name</label>
              <Input
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="mt-1"
                data-testid="auth-name"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium">Email</label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="mt-1"
              data-testid="auth-email"
            />
          </div>
          <div>
            <label className="text-xs font-medium">Password</label>
            <Input
              type="password"
              placeholder={tab === "signup" ? "Min. 6 characters" : "••••••••"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="mt-1"
              data-testid="auth-password"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={isLoading || !email || !password}
            data-testid="auth-submit"
          >
            {isLoading
              ? <><Loader2 size={13} className="animate-spin" />Processing...</>
              : tab === "signup"
              ? <><BarChart3 size={13} />Create Free Account</>
              : "Sign In"
            }
          </Button>

          <p className="text-xs text-center text-muted-foreground pt-1">
            {tab === "signup"
              ? <>Already have an account?{" "}
                  <button type="button" onClick={() => setTab("login")} className="text-primary hover:underline font-medium">Sign in</button>
                </>
              : <>Don't have an account?{" "}
                  <button type="button" onClick={() => setTab("signup")} className="text-primary hover:underline font-medium">Sign up free</button>
                </>
            }
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
