import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { Loader2, AlertCircle, Link as LinkIcon } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import {
  Target, CheckCircle, AlertTriangle, ShieldAlert, TrendingUp, Download,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";

interface AnalysisResult {
  fitScore: number;
  fitLabel: string;
  acquirerType: string;
  acquirerRationale: string;
  evRange: { low: number; high: number; multiple: string; multipleRange: string };
  premiumRange: string;
  synergyPotential: string;
  synergyDetails: string;
  keyStrengths: string[];
  keyRisks: string[];
  lboViability: string;
  lboRationale: string;
  dealbreakerFlags: string[];
  verdict: string;
  radarScores?: {
    financial: number; growth: number; synergy: number; lbo: number; strategic: number; risk: number;
  };
}

function getFitColor(score: number) {
  if (score >= 75) return { text: "text-emerald-500", bg: "#10b981" };
  if (score >= 50) return { text: "text-blue-500", bg: "#3b82f6" };
  if (score >= 30) return { text: "text-amber-500", bg: "#f59e0b" };
  return { text: "text-red-500", bg: "#ef4444" };
}

function formatCurrency(val: number) {
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}B`;
  return `$${val.toFixed(0)}M`;
}

function ScoreRing({ score }: { score: number }) {
  const colors = getFitColor(score);
  const r = 42, circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative flex items-center justify-center w-28 h-28">
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/40" />
        <circle cx="56" cy="56" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          className="score-ring transition-all duration-700"
          style={{ stroke: colors.bg }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold mono ${colors.text}`}>{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function ExportButton({ analysisId, companyName }: { analysisId: number; companyName: string }) {
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/analyses/${analysisId}/pdf`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dealflow-${companyName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally { setExporting(false); }
  };
  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="gap-1.5">
      {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      {exporting ? "Generating..." : "Export PDF"}
    </Button>
  );
}

export default function SharedAnalysis() {
  const [, params] = useRoute("/share/:token");
  const token = params?.token;

  const { data: analysis, isLoading, isError } = useQuery({
    queryKey: ["/api/share", token],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/share/${token}`);
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading shared analysis...</span>
        </div>
      </AppLayout>
    );
  }

  if (isError || !analysis) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto py-24 text-center">
          <AlertCircle size={32} className="text-muted-foreground mx-auto mb-3" />
          <h2 className="font-semibold mb-1.5">Analysis not found</h2>
          <p className="text-sm text-muted-foreground">This shared link may have expired or is invalid.</p>
        </div>
      </AppLayout>
    );
  }

  const result: AnalysisResult = analysis.result;
  const fitColors = getFitColor(result.fitScore);

  const radarData = result.radarScores ? [
    { axis: "Financial", value: result.radarScores.financial },
    { axis: "Growth", value: result.radarScores.growth },
    { axis: "Synergy", value: result.radarScores.synergy },
    { axis: "LBO", value: result.radarScores.lbo },
    { axis: "Strategic", value: result.radarScores.strategic },
    { axis: "Risk Adj.", value: result.radarScores.risk },
  ] : null;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Shared banner */}
        <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-muted/50 border text-xs text-muted-foreground">
          <LinkIcon size={12} />
          Shared M&A Analysis — DealFlow AI
        </div>

        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold">{analysis.companyName}</h1>
              <p className="text-sm text-muted-foreground">{analysis.industry} · M&A Target Analysis</p>
              <div className="mt-2">
                <ExportButton analysisId={analysis.id} companyName={analysis.companyName} />
              </div>
            </div>
            <ScoreRing score={result.fitScore} />
          </div>

          {/* Fit + Acquirer */}
          <div className="grid grid-cols-2 gap-3">
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
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Acquirer Rationale</p>
            <p className="text-sm leading-relaxed">{result.acquirerRationale}</p>
          </div>

          {/* EV Range */}
          <div className="rounded-lg border bg-card p-3">
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

          {/* Radar */}
          {radarData && (
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Deal Profile Radar</p>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Score" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Synergy + LBO */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground mb-1.5">Synergy Potential</p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                result.synergyPotential === "High" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" :
                result.synergyPotential === "Medium" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800" :
                "bg-muted text-muted-foreground border-border"
              }`}>{result.synergyPotential}</span>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{result.synergyDetails}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground mb-1.5">LBO Viability</p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                result.lboViability.includes("Strong") ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" :
                result.lboViability.includes("Moderate") ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800" :
                "bg-red-500/15 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
              }`}>{result.lboViability.replace(" Candidate", "")}</span>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{result.lboRationale}</p>
            </div>
          </div>

          {/* Strengths + Risks */}
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle size={13} className="text-emerald-500" />
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key Strengths</p>
              </div>
              <ul className="space-y-1.5">
                {result.keyStrengths.map((s, i) => (
                  <li key={i} className="text-xs flex gap-2">
                    <span className="text-emerald-500 flex-shrink-0">↑</span><span>{s}</span>
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
                    <span className="text-amber-500 flex-shrink-0">↓</span><span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Dealbreakers */}
          {result.dealbreakerFlags && result.dealbreakerFlags.length > 0 && (
            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ShieldAlert size={13} className="text-red-500" />
                <p className="text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">Dealbreaker Flags</p>
              </div>
              <ul className="space-y-1.5">
                {result.dealbreakerFlags.map((f, i) => (
                  <li key={i} className="text-xs text-red-700 dark:text-red-300 flex gap-2">
                    <span className="flex-shrink-0">⚠</span><span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Verdict */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Target size={13} className="text-primary" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Banker's Verdict</p>
            </div>
            <p className="text-sm leading-relaxed">{result.verdict}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
