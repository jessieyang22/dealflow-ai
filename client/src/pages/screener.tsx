import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/lib/auth";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Plus, X, Zap, TrendingUp, Award, AlertTriangle, Lock,
  ChevronDown, ChevronUp, BarChart3, RefreshCw,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const MAX_FREE_TARGETS = 5;
const MAX_PRO_TARGETS = 5;

interface ScreenResult {
  rank: number;
  ticker: string;
  company_name: string;
  fit_score: number;
  ev_low: number;
  ev_high: number;
  revenue_ttm: number | null;
  ebitda_margin: number | null;
  verdict: string;
  top_synergies: string[];
  key_risks: string[];
  recommendation: "Strong Buy" | "Buy" | "Hold" | "Pass";
  rationale: string;
}

interface ScreenResponse {
  results: ScreenResult[];
  acquirer: string;
  sector: string;
  screened_at: string;
}

const SCORE_COLOR = (score: number) => {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#3b82f6";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
};

const REC_COLORS: Record<string, string> = {
  "Strong Buy": "bg-green-500/10 text-green-600 border-green-500/20",
  "Buy":        "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "Hold":       "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  "Pass":       "bg-red-500/10 text-red-600 border-red-500/20",
};

const FMT_EV = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
};

function ResultCard({ r, expanded, onToggle }: {
  r: ScreenResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card
      className="border bg-card transition-all hover:shadow-md cursor-pointer"
      onClick={onToggle}
      data-testid={`screener-result-${r.ticker}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          {/* Rank + Identity */}
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white`}
              style={{ backgroundColor: SCORE_COLOR(r.fit_score) }}>
              #{r.rank}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base">{r.ticker}</span>
                <span className="text-sm text-muted-foreground">{r.company_name}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{r.verdict}</div>
            </div>
          </div>

          {/* Score + Rec */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <div className="text-2xl font-bold" style={{ color: SCORE_COLOR(r.fit_score) }}>
                {r.fit_score}
              </div>
              <div className="text-xs text-muted-foreground">Fit Score</div>
            </div>
            <Badge
              variant="outline"
              className={`text-xs font-semibold ${REC_COLORS[r.recommendation] || ""}`}
            >
              {r.recommendation}
            </Badge>
            <button className="text-muted-foreground hover:text-foreground p-1">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* Fit Score Bar */}
        <Progress value={r.fit_score} className="h-1.5 mt-2"
          style={{ "--progress-color": SCORE_COLOR(r.fit_score) } as React.CSSProperties} />
      </CardHeader>

      {expanded && (
        <CardContent className="border-t pt-4 space-y-4" onClick={e => e.stopPropagation()}>
          {/* Financials */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1">EV Range</div>
              <div className="text-sm font-semibold">{FMT_EV(r.ev_low)} – {FMT_EV(r.ev_high)}</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1">Revenue (TTM)</div>
              <div className="text-sm font-semibold">{r.revenue_ttm ? FMT_EV(r.revenue_ttm) : "N/A"}</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1">EBITDA Margin</div>
              <div className="text-sm font-semibold">{r.ebitda_margin != null ? `${r.ebitda_margin.toFixed(1)}%` : "N/A"}</div>
            </div>
          </div>

          {/* Rationale */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Investment Rationale</div>
            <p className="text-sm text-foreground/80 leading-relaxed">{r.rationale}</p>
          </div>

          {/* Synergies + Risks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-green-600 mb-2 uppercase tracking-wide flex items-center gap-1">
                <TrendingUp size={11} />Synergy Drivers
              </div>
              <ul className="space-y-1">
                {r.top_synergies.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                    <span className="text-green-500 mt-0.5">•</span>{s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold text-red-500 mb-2 uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle size={11} />Key Risks
              </div>
              <ul className="space-y-1">
                {r.key_risks.map((r2, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                    <span className="text-red-400 mt-0.5">•</span>{r2}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

const EXAMPLE_PRESET = {
  acquirer: "Microsoft Corporation",
  sector: "Enterprise SaaS",
  targets: ["CRM", "NOW", "WDAY", "DDOG", "MDB"],
};

export default function Screener() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [acquirer, setAcquirer] = useState("");
  const [sector, setSector] = useState("");
  const [targets, setTargets] = useState<string[]>(["", ""]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScreenResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function loadExample() {
    setAcquirer(EXAMPLE_PRESET.acquirer);
    setSector(EXAMPLE_PRESET.sector);
    setTargets(EXAMPLE_PRESET.targets);
    toast({ title: "Example loaded", description: "Microsoft acquiring Enterprise SaaS targets. Hit Run Bulk Screen." });
  }

  const isPro = true; // all features free
  const maxTargets = MAX_PRO_TARGETS;

  function addTarget() {
    if (targets.length >= maxTargets) {
      if (!isPro) {
        toast({ title: "Pro required", description: "Screen up to 5 targets simultaneously with Pro.", variant: "destructive" });
      }
      return;
    }
    setTargets(t => [...t, ""]);
  }

  function removeTarget(i: number) {
    if (targets.length <= 1) return;
    setTargets(t => t.filter((_, idx) => idx !== i));
  }

  function updateTarget(i: number, val: string) {
    setTargets(t => t.map((v, idx) => idx === i ? val.toUpperCase() : v));
  }

  async function runScreen() {
    const validTargets = targets.filter(t => t.trim());
    if (!acquirer.trim()) {
      toast({ title: "Missing acquirer", description: "Enter the acquiring company name.", variant: "destructive" });
      return;
    }
    if (validTargets.length < 1) {
      toast({ title: "Missing targets", description: "Enter at least one target ticker.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResults(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/screen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ acquirer, sector, targets: validTargets }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Screening failed");
      }
      const data: ScreenResponse = await res.json();
      setResults(data);
      setExpanded(new Set([data.results[0]?.ticker]));
      toast({ title: "Screen complete", description: `Ranked ${data.results.length} targets by M&A fit.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const chartData = results?.results.map(r => ({
    ticker: r.ticker,
    score: r.fit_score,
    fill: SCORE_COLOR(r.fit_score),
  })) ?? [];

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Zap size={20} className="text-primary" />
              Sector Screener
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Score up to {maxTargets} acquisition targets simultaneously — ranked by strategic fit, valuation, and synergy potential.
            </p>
          </div>
          <button
            onClick={loadExample}
            className="text-xs border border-dashed border-primary/40 text-primary hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-colors font-medium flex-shrink-0"
          >
            ⚡ Try Example: MSFT + SaaS Targets
          </button>
        </div>

        {/* Input Panel */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Screen Parameters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Acquirer / Strategic Buyer
                </label>
                <Input
                  placeholder="e.g. Microsoft Corporation"
                  value={acquirer}
                  onChange={e => setAcquirer(e.target.value)}
                  data-testid="screener-acquirer"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Target Sector (optional)
                </label>
                <Input
                  placeholder="e.g. Enterprise SaaS, Healthcare IT"
                  value={sector}
                  onChange={e => setSector(e.target.value)}
                  data-testid="screener-sector"
                />
              </div>
            </div>

            {/* Target Tickers */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                Target Tickers ({targets.filter(t => t.trim()).length}/{maxTargets})
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {targets.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      placeholder={`Target ${i + 1}`}
                      value={t}
                      onChange={e => updateTarget(i, e.target.value)}
                      className="font-mono uppercase"
                      maxLength={8}
                      data-testid={`screener-target-${i}`}
                    />
                    {targets.length > 1 && (
                      <button onClick={() => removeTarget(i)} className="text-muted-foreground hover:text-red-500 transition-colors">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}

                {targets.length < maxTargets && (
                  <button
                    onClick={addTarget}
                    className="flex items-center justify-center gap-1.5 border border-dashed border-muted-foreground/30 rounded-md h-9 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    data-testid="screener-add-target"
                  >
                    <Plus size={13} />Add Target
                  </button>
                )}


              </div>
            </div>

            <Button
              onClick={runScreen}
              disabled={loading}
              className="w-full font-semibold"
              data-testid="screener-run"
            >
              {loading ? (
                <><RefreshCw size={14} className="animate-spin mr-2" />Screening targets...</>
              ) : (
                <><Search size={14} className="mr-2" />Run Bulk Screen</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Loading Skeletons */}
        {loading && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-primary" />
              Running parallel AI analysis across {targets.filter(t => t.trim()).length} targets...
            </div>
            {[1, 2, 3].map(i => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-8 w-16" />
                </div>
                <Skeleton className="h-1.5 w-full mt-3" />
              </Card>
            ))}
          </div>
        )}

        {/* Results */}
        {results && !loading && (
          <div className="space-y-4">
            {/* Summary Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Award size={16} className="text-primary" />
                  Screen Results — {results.acquirer}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {results.results.length} targets ranked by M&A fit · {results.sector && `${results.sector} sector · `}
                  {new Date(results.screened_at).toLocaleString()}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={runScreen} className="text-xs">
                <RefreshCw size={12} className="mr-1" />Re-run
              </Button>
            </div>

            {/* Bar Chart */}
            {chartData.length > 1 && (
              <Card className="p-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <BarChart3 size={12} />Fit Score Comparison
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="ticker" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip
                      formatter={(val: number) => [`${val}/100`, "Fit Score"]}
                      contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))" }}
                    />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Result Cards */}
            <div className="space-y-3">
              {results.results.map(r => (
                <ResultCard
                  key={r.ticker}
                  r={r}
                  expanded={expanded.has(r.ticker)}
                  onToggle={() => {
                    const next = new Set(expanded);
                    next.has(r.ticker) ? next.delete(r.ticker) : next.add(r.ticker);
                    setExpanded(next);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
