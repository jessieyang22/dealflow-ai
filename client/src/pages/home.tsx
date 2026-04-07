import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Building2,
  DollarSign,
  BarChart3,
  Clock,
  ChevronRight,
  Loader2,
  Target,
  ShieldAlert,
  Zap,
  Download,
  FileText,
} from "lucide-react";

// ─── Logo ──────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-label="DealFlow"
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

// ─── Form Schema ────────────────────────────────────────────────────────────
const formSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().min(1, "Industry is required"),
  revenue: z.string().min(1, "Revenue is required").refine(v => !isNaN(Number(v)) && Number(v) > 0, "Must be a positive number"),
  ebitda: z.string().min(1, "EBITDA is required").refine(v => !isNaN(Number(v)), "Must be a number"),
  growthRate: z.string().min(1, "Growth rate is required").refine(v => !isNaN(Number(v)), "Must be a number"),
  debtLoad: z.string().min(1, "Debt load is required").refine(v => !isNaN(Number(v)) && Number(v) >= 0, "Must be 0 or greater"),
  additionalContext: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Types ──────────────────────────────────────────────────────────────────
interface AnalysisResult {
  fitScore: number;
  fitLabel: string;
  acquirerType: string;
  acquirerRationale: string;
  evRange: {
    low: number;
    high: number;
    multiple: string;
    multipleRange: string;
  };
  premiumRange: string;
  synergyPotential: string;
  synergyDetails: string;
  keyStrengths: string[];
  keyRisks: string[];
  lboViability: string;
  lboRationale: string;
  dealbreakerFlags: string[];
  verdict: string;
}

interface AnalysisRecord {
  id: number;
  companyName: string;
  industry: string;
  createdAt: number | null;
  result: AnalysisResult | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getFitColor(score: number) {
  if (score >= 75) return { text: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500" };
  if (score >= 50) return { text: "text-blue-500 dark:text-blue-400", bg: "bg-blue-500" };
  if (score >= 30) return { text: "text-amber-500 dark:text-amber-400", bg: "bg-amber-500" };
  return { text: "text-red-500 dark:text-red-400", bg: "bg-red-500" };
}

function getLBOColor(viability: string) {
  if (viability.includes("Strong")) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
  if (viability.includes("Moderate")) return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800";
  return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800";
}

function getSynergyColor(synergy: string) {
  if (synergy === "High") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
  if (synergy === "Medium") return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800";
  return "bg-muted text-muted-foreground";
}

function formatCurrency(val: number) {
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}B`;
  return `$${val.toFixed(0)}M`;
}

function timeAgo(ts: number | string | null) {
  if (!ts) return "just now";
  const d = typeof ts === 'string' ? new Date(ts) : new Date(typeof ts === 'number' && ts < 1e10 ? ts * 1000 : ts);
  if (isNaN(d.getTime())) return "just now";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Score Ring ──────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const colors = getFitColor(score);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-28 h-28">
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle
          cx="56" cy="56" r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/40"
        />
        <circle
          cx="56" cy="56" r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`score-ring ${colors.bg} transition-all duration-700 ease-out`}
          style={{ stroke: "currentColor" }}
        />
      </svg>
      <div className={`absolute inset-0 flex flex-col items-center justify-center count-up`}>
        <span className={`text-3xl font-bold mono ${colors.text}`}>{score}</span>
        <span className="text-xs text-muted-foreground font-medium">/ 100</span>
      </div>
    </div>
  );
}

// ─── Results Panel ────────────────────────────────────────────────────────────
function ExportButton({ analysisId, companyName }: { analysisId?: number; companyName: string }) {
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  if (!analysisId) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/pdf`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = companyName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      a.download = `dealflow-${safeName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", description: "Could not generate PDF.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={exporting}
      data-testid="button-export-pdf"
      className="gap-1.5"
    >
      {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      {exporting ? "Generating..." : "Export PDF"}
    </Button>
  );
}

function ResultsPanel({ result, companyName, analysisId }: { result: AnalysisResult; companyName: string; analysisId?: number }) {
  const fitColors = getFitColor(result.fitScore);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 fade-in-up fade-in-up-1">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">{companyName}</h2>
            <ExportButton analysisId={analysisId} companyName={companyName} />
          </div>
          <p className="text-sm text-muted-foreground">M&amp;A Target Analysis</p>
        </div>
        <ScoreRing score={result.fitScore} />
      </div>

      {/* Fit + Acquirer */}
      <div className="grid grid-cols-2 gap-3 fade-in-up fade-in-up-2">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-1">Deal Fit</p>
          <p className={`text-sm font-semibold ${fitColors.text}`}>{result.fitLabel}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-1">Acquirer Type</p>
          <p className="text-sm font-semibold">{result.acquirerType}</p>
        </div>
      </div>

      {/* Rationale */}
      <div className="rounded-lg border bg-card p-3 fade-in-up fade-in-up-2">
        <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Acquirer Rationale</p>
        <p className="text-sm leading-relaxed">{result.acquirerRationale}</p>
      </div>

      {/* EV Range */}
      <div className="rounded-lg border bg-card p-3 fade-in-up fade-in-up-3">
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Valuation Range</p>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xl font-bold mono text-primary">{formatCurrency(result.evRange.low)}</span>
          <span className="text-muted-foreground">—</span>
          <span className="text-xl font-bold mono text-primary">{formatCurrency(result.evRange.high)}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded mono">{result.evRange.multipleRange}</span>
          {result.premiumRange && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{result.premiumRange}</span>
          )}
        </div>
      </div>

      {/* Synergy + LBO */}
      <div className="grid grid-cols-2 gap-3 fade-in-up fade-in-up-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-1.5">Synergy Potential</p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${getSynergyColor(result.synergyPotential)}`}>
            {result.synergyPotential}
          </span>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{result.synergyDetails}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-1.5">LBO Viability</p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${getLBOColor(result.lboViability)}`}>
            {result.lboViability.replace(" Candidate", "")}
          </span>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{result.lboRationale}</p>
        </div>
      </div>

      {/* Strengths + Risks */}
      <div className="grid grid-cols-1 gap-3 fade-in-up fade-in-up-4">
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle size={13} className="text-emerald-500" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key Strengths</p>
          </div>
          <ul className="space-y-1.5">
            {result.keyStrengths.map((s, i) => (
              <li key={i} className="text-xs flex gap-2">
                <span className="text-emerald-500 mt-0.5 flex-shrink-0">↑</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={13} className="text-amber-500" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key Risks</p>
          </div>
          <ul className="space-y-1.5">
            {result.keyRisks.map((r, i) => (
              <li key={i} className="text-xs flex gap-2">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">↓</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Dealbreakers */}
      {result.dealbreakerFlags && result.dealbreakerFlags.length > 0 && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-500/5 p-3 fade-in-up fade-in-up-5">
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldAlert size={13} className="text-red-500" />
            <p className="text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">Dealbreaker Flags</p>
          </div>
          <ul className="space-y-1.5">
            {result.dealbreakerFlags.map((f, i) => (
              <li key={i} className="text-xs text-red-700 dark:text-red-300 flex gap-2">
                <span className="flex-shrink-0">⚠</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Verdict */}
      <div className="rounded-lg border bg-card p-4 fade-in-up fade-in-up-6">
        <div className="flex items-center gap-1.5 mb-2">
          <Target size={13} className="text-primary" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Banker's Verdict</p>
        </div>
        <p className="text-sm leading-relaxed">{result.verdict}</p>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function AnalysisSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="skeleton h-5 w-40 rounded" />
          <div className="skeleton h-3 w-28 rounded" />
        </div>
        <div className="skeleton w-28 h-28 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-16 rounded-lg" />
        <div className="skeleton h-16 rounded-lg" />
      </div>
      <div className="skeleton h-20 rounded-lg" />
      <div className="skeleton h-24 rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-36 rounded-lg" />
        <div className="skeleton h-36 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div className="skeleton h-28 rounded-lg" />
        <div className="skeleton h-28 rounded-lg" />
      </div>
      <div className="skeleton h-24 rounded-lg" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeResult, setActiveResult] = useState<{ result: AnalysisResult; companyName: string; id?: number } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "",
      industry: "",
      revenue: "",
      ebitda: "",
      growthRate: "",
      debtLoad: "",
      additionalContext: "",
    },
  });

  const { data: recentAnalyses } = useQuery<AnalysisRecord[]>({
    queryKey: ["/api/analyses"],
  });

  const analyzeMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const res = await apiRequest("POST", "/api/analyze", data);
      return res.json();
    },
    onSuccess: (data) => {
      setActiveResult({ result: data.result, companyName: form.getValues("companyName"), id: data.id });
      qc.invalidateQueries({ queryKey: ["/api/analyses"] });
      setIsAnalyzing(false);
    },
    onError: () => {
      toast({ title: "Analysis failed", description: "Please try again.", variant: "destructive" });
      setIsAnalyzing(false);
    },
  });

  const onSubmit = (data: FormValues) => {
    setIsAnalyzing(true);
    setActiveResult(null);
    analyzeMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div>
              <span className="font-semibold text-sm tracking-tight">DealFlow</span>
              <span className="text-muted-foreground text-xs ml-1.5 hidden sm:inline">AI M&amp;A Analyzer</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
              <Zap size={11} className="text-primary" />
              Powered by Claude AI
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto w-full px-4 py-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Left: Input Form ── */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">M&amp;A Target Analysis</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Input company financials to receive an AI-powered deal assessment — fit score, valuation range, synergy analysis, and banker's verdict.
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">Company Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Acme Corp" {...field} data-testid="input-company-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">Industry / Sector</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. SaaS, Healthcare IT, Industrials" {...field} data-testid="input-industry" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="revenue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">LTM Revenue ($M)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 250" {...field} data-testid="input-revenue" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ebitda"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">LTM EBITDA ($M)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 55" {...field} data-testid="input-ebitda" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="growthRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Revenue Growth (%)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 18" {...field} data-testid="input-growth" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="debtLoad"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Total Debt ($M)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 80" {...field} data-testid="input-debt" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="additionalContext"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">Additional Context <span className="text-muted-foreground">(optional)</span></FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="e.g. Market leader in SMB payroll, 90%+ recurring revenue, strong retention"
                            rows={3}
                            {...field}
                            data-testid="input-context"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isAnalyzing}
                    data-testid="button-analyze"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 size={15} className="mr-2 animate-spin" />
                        Analyzing deal...
                      </>
                    ) : (
                      <>
                        <BarChart3 size={15} className="mr-2" />
                        Run Deal Analysis
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </div>

            {/* Recent Analyses */}
            {recentAnalyses && recentAnalyses.length > 0 && (
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Clock size={13} className="text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent Analyses</p>
                </div>
                <ul className="space-y-1.5" role="list">
                  {recentAnalyses.slice(0, 6).map((a) => (
                    <li key={a.id}>
                      <button
                        className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted transition-colors text-left"
                        onClick={() => a.result && setActiveResult({ result: a.result, companyName: a.companyName, id: a.id })}
                        data-testid={`button-recent-${a.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 size={12} className="text-muted-foreground flex-shrink-0" />
                          <span className="text-xs font-medium truncate">{a.companyName}</span>
                          <span className="text-xs text-muted-foreground truncate hidden sm:block">{a.industry}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {a.result && (
                            <span className={`text-xs font-bold mono ${getFitColor(a.result.fitScore).text}`}>
                              {a.result.fitScore}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
                          <ChevronRight size={11} className="text-muted-foreground" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── Right: Results ── */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border bg-card p-5 min-h-[480px]">
              {isAnalyzing ? (
                <AnalysisSkeleton />
              ) : activeResult ? (
                <ResultsPanel result={activeResult.result} companyName={activeResult.companyName} analysisId={activeResult.id} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center py-16 text-center" data-testid="empty-state">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <BarChart3 size={22} className="text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1.5">Run your first analysis</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Enter a company's financials on the left to receive an AI deal assessment — fit score, EV range, synergy analysis, and LBO viability.
                  </p>
                  <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-sm">
                    {[
                      { icon: Target, label: "Fit Score", desc: "0–100 deal quality" },
                      { icon: DollarSign, label: "EV Range", desc: "Valuation estimate" },
                      { icon: TrendingUp, label: "LBO Analysis", desc: "Leverage viability" },
                    ].map(({ icon: Icon, label, desc }) => (
                      <div key={label} className="rounded-lg border bg-muted/30 p-3 text-center">
                        <Icon size={16} className="text-primary mx-auto mb-1.5" />
                        <p className="text-xs font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">DealFlow AI — for demonstration purposes only. Not investment advice.</p>
          <p className="text-xs text-muted-foreground">Built with Claude AI</p>
        </div>
      </footer>
    </div>
  );
}
