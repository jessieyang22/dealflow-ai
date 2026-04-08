import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useLocation } from "wouter";
import {
  TrendingUp, AlertTriangle, CheckCircle, Building2, BarChart3,
  Clock, ChevronRight, Loader2, Target, ShieldAlert, Download,
  Share2, PlusCircle, Check, TableProperties, Calculator, Percent,
  FileSpreadsheet, ChevronDown, ChevronUp, LineChart, Layers,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import { TickerSearch } from "@/components/TickerSearch";
import type { TickerData } from "@/components/TickerSearch";
import AuthModal from "@/components/AuthModal";
import { useAuth, FREE_LIMIT, getAuthToken } from "@/lib/auth";

// ── Sector Modes ──────────────────────────────────────────────────────────────
const SECTOR_MODES = [
  { value: "general", label: "General" },
  { value: "saas", label: "SaaS / Cloud" },
  { value: "healthcare", label: "Healthcare / MedTech" },
  { value: "industrials", label: "Industrials" },
  { value: "fintech", label: "FinTech / Financial" },
  { value: "consumer", label: "Consumer / Brands" },
  { value: "energy", label: "Energy / Infrastructure" },
];

// ── Form Schema ───────────────────────────────────────────────────────────────
const formSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().min(1, "Industry is required"),
  revenue: z.string().min(1, "Revenue is required").refine(v => !isNaN(Number(v)) && Number(v) > 0, "Must be a positive number"),
  ebitda: z.string().min(1, "EBITDA is required").refine(v => !isNaN(Number(v)), "Must be a number"),
  growthRate: z.string().min(1, "Growth rate is required").refine(v => !isNaN(Number(v)), "Must be a number"),
  debtLoad: z.string().min(1, "Debt load is required").refine(v => !isNaN(Number(v)) && Number(v) >= 0, "Must be 0 or greater"),
  additionalContext: z.string().optional(),
  sectorMode: z.string().default("general"),
});

type FormValues = z.infer<typeof formSchema>;

// ── Types ─────────────────────────────────────────────────────────────────────
interface RadarScores {
  financial: number;
  growth: number;
  synergy: number;
  lbo: number;
  strategic: number;
  risk: number;
}

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
  radarScores?: RadarScores;
}

interface AnalysisRecord {
  id: number;
  companyName: string;
  industry: string;
  createdAt: number | null;
  result: AnalysisResult | null;
  shareToken?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getFitColor(score: number) {
  if (score >= 75) return { text: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500" };
  if (score >= 50) return { text: "text-blue-500 dark:text-blue-400", bg: "bg-blue-500" };
  if (score >= 30) return { text: "text-amber-500 dark:text-amber-400", bg: "bg-amber-500" };
  return { text: "text-red-500 dark:text-red-400", bg: "bg-red-500" };
}

function getLBOColor(v: string) {
  if (v.includes("Strong")) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
  if (v.includes("Moderate")) return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800";
  return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800";
}

function getSynergyColor(s: string) {
  if (s === "High") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
  if (s === "Medium") return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800";
  return "bg-muted text-muted-foreground border-border";
}

function formatCurrency(val: number) {
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}B`;
  return `$${val.toFixed(0)}M`;
}

function timeAgo(ts: number | string | null) {
  if (!ts) return "just now";
  const d = typeof ts === "string" ? new Date(ts) : new Date(typeof ts === "number" && ts < 1e10 ? ts * 1000 : ts);
  if (isNaN(d.getTime())) return "just now";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Score Ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const colors = getFitColor(score);
  const r = 42;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative flex items-center justify-center w-28 h-28">
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/40" />
        <circle
          cx="56" cy="56" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          className={`score-ring transition-all duration-700 ease-out`}
          style={{ stroke: `hsl(var(--${colors.bg.replace("bg-", "").replace("-500", "")} 60% 45%))` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center count-up">
        <span className={`text-3xl font-bold mono ${colors.text}`}>{score}</span>
        <span className="text-xs text-muted-foreground font-medium">/ 100</span>
      </div>
    </div>
  );
}

// ── Radar Chart ───────────────────────────────────────────────────────────────
function DealRadarChart({ scores }: { scores: RadarScores }) {
  const data = [
    { axis: "Financial", value: scores.financial },
    { axis: "Growth", value: scores.growth },
    { axis: "Synergy", value: scores.synergy },
    { axis: "LBO", value: scores.lbo },
    { axis: "Strategic", value: scores.strategic },
    { axis: "Risk Adj.", value: scores.risk },
  ];
  return (
    <div className="rounded-lg border bg-card p-3 fade-in-up fade-in-up-3">
      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Deal Profile Radar</p>
      <ResponsiveContainer width="100%" height={200}>
        <RadarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Score"
            dataKey="value"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Export Button ─────────────────────────────────────────────────────────────
function ExportButton({ analysisId, companyName }: { analysisId?: number; companyName: string }) {
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();
  if (!analysisId) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/pdf`);
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
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} data-testid="button-export-pdf" className="gap-1.5">
      {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      {exporting ? "Generating..." : "Export PDF"}
    </Button>
  );
}

// ── Share Button ──────────────────────────────────────────────────────────────
function ShareButton({ shareToken }: { shareToken?: string }) {
  const [copied, setCopied] = useState(false);
  if (!shareToken) return null;

  const handleShare = () => {
    const url = `${window.location.origin}${window.location.pathname}#/share/${shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5" data-testid="button-share">
      {copied ? <Check size={13} className="text-emerald-500" /> : <Share2 size={13} />}
      {copied ? "Copied!" : "Share"}
    </Button>
  );
}

// ── CSV Export ───────────────────────────────────────────────────────────────
function CSVExportButton({ result, companyName, revenue, ebitda }: {
  result: AnalysisResult; companyName: string; revenue: string; ebitda: string;
}) {
  function handleCSV() {
    const rev = parseFloat(revenue) || 0;
    const ebt = parseFloat(ebitda) || 0;
    const margin = rev > 0 ? ((ebt / rev) * 100).toFixed(1) : "N/A";
    const rows = [
      ["Field", "Value"],
      ["Company", companyName],
      ["LTM Revenue ($M)", revenue],
      ["LTM EBITDA ($M)", ebitda],
      ["EBITDA Margin", `${margin}%`],
      ["Fit Score", result.fitScore],
      ["Fit Label", result.fitLabel],
      ["EV Low ($M)", result.evRange.low],
      ["EV High ($M)", result.evRange.high],
      ["EV/EBITDA Range", result.evRange.multipleRange],
      ["Acquirer Type", result.acquirerType],
      ["Synergy Potential", result.synergyPotential],
      ["LBO Viability", result.lboViability],
      ["Premium Range", result.premiumRange || "N/A"],
      ["Key Strengths", result.keyStrengths.join(" | ")],
      ["Key Risks", result.keyRisks.join(" | ")],
      ["Verdict", result.verdict],
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${companyName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-analysis.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Button variant="outline" size="sm" onClick={handleCSV} className="gap-1.5" data-testid="button-export-csv">
      <FileSpreadsheet size={13} />CSV
    </Button>
  );
}

// ── Sensitivity Table ─────────────────────────────────────────────────────────
function SensitivityTable({ revenue, ebitda }: { revenue: string; ebitda: string }) {
  const rev = parseFloat(revenue) || 0;
  const ebt = parseFloat(ebitda) || 0;
  if (!rev || !ebt) return null;

  // EV/EBITDA multiples on rows, EBITDA margin expansion on columns
  const multiples  = [6, 8, 10, 12, 14];
  const marginAdjs = [-200, -100, 0, +100, +200]; // bps adjustment to EBITDA margin

  function cellColor(ev: number, baseEV: number) {
    const pct = (ev - baseEV) / baseEV;
    if (pct >  0.15) return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold";
    if (pct >  0.05) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    if (pct < -0.15) return "bg-red-500/20 text-red-700 dark:text-red-300 font-semibold";
    if (pct < -0.05) return "bg-red-500/10 text-red-600 dark:text-red-400";
    return "bg-primary/10 text-primary font-semibold"; // base case
  }

  const baseEV = ebt * 10; // 10x base
  const baseMargin = rev > 0 ? ebt / rev : 0;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-3">
        <TableProperties size={13} className="text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sensitivity Analysis</p>
        <span className="text-xs text-muted-foreground ml-1">EV ($M) · rows = EV/EBITDA · cols = margin ±bps</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left p-1.5 text-muted-foreground font-medium border-b">EV/EBITDA</th>
              {marginAdjs.map(adj => (
                <th key={adj} className={`p-1.5 text-center font-medium border-b ${
                  adj === 0 ? "text-primary" : "text-muted-foreground"
                }`}>
                  {adj === 0 ? "Base" : adj > 0 ? `+${adj}bps` : `${adj}bps`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {multiples.map(mult => (
              <tr key={mult} className="border-b border-border/40 last:border-0">
                <td className={`p-1.5 font-mono font-semibold ${
                  mult === 10 ? "text-primary" : "text-muted-foreground"
                }`}>{mult}x</td>
                {marginAdjs.map(adj => {
                  const adjMargin = baseMargin + adj / 10000;
                  const adjEBITDA = rev * adjMargin;
                  const ev = adjEBITDA * mult;
                  const formatted = ev >= 1000 ? `$${(ev / 1000).toFixed(1)}B` : `$${ev.toFixed(0)}M`;
                  const isBase = mult === 10 && adj === 0;
                  return (
                    <td key={adj} className={`p-1.5 text-center font-mono rounded ${
                      isBase ? "bg-primary/10 text-primary font-bold" : cellColor(ev, baseEV)
                    }`}>
                      {formatted}
                      {isBase && <span className="block text-[9px] text-primary/70">base</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Accretion / Dilution ──────────────────────────────────────────────────────
function AccretionDilution({ evLow, evHigh, ebitda }: { evLow: number; evHigh: number; ebitda: string }) {
  const [acquirerRevenue, setAcquirerRevenue] = useState("");
  const [acquirerEPS, setAcquirerEPS] = useState("");
  const [acquirerShares, setAcquirerShares] = useState("");
  const [dealPercCash, setDealPercCash] = useState("50"); // % cash vs stock
  const [expanded, setExpanded] = useState(false);

  const targetEBITDA = parseFloat(ebitda) || 0;
  const evMid = (evLow + evHigh) / 2;
  const eps = parseFloat(acquirerEPS);
  const shares = parseFloat(acquirerShares);
  const cashPct = parseFloat(dealPercCash) / 100;
  const debtRate = 0.065; // 6.5% debt cost
  const stockDilutionPct = (1 - cashPct);

  const canCalc = !isNaN(eps) && eps > 0 && !isNaN(shares) && shares > 0 && evMid > 0;
  let accretionPct: number | null = null;
  let newEPS: number | null = null;

  if (canCalc) {
    const totalEarnings = eps * shares; // acquirer total EPS pool
    const debtFinanced = evMid * cashPct;
    const interestCost = debtFinanced * debtRate; // after-tax cost
    const newShares = evMid * stockDilutionPct / (eps * 15); // rough: value shares at 15x
    const targetContrib = targetEBITDA * 0.35; // EBITDA → ~35% net income proxy
    const netIncomeDelta = targetContrib - interestCost;
    newEPS = (totalEarnings + netIncomeDelta) / (shares + newShares);
    accretionPct = ((newEPS - eps) / eps) * 100;
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-1.5">
          <Calculator size={13} className="text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accretion / Dilution</p>
          <span className="text-xs text-muted-foreground ml-1">Quick EPS impact</span>
        </div>
        {expanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Acquirer EPS ($)</label>
              <input
                type="number" placeholder="e.g. 8.50"
                className="w-full text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                value={acquirerEPS} onChange={e => setAcquirerEPS(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Shares Out. (M)</label>
              <input
                type="number" placeholder="e.g. 500"
                className="w-full text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                value={acquirerShares} onChange={e => setAcquirerShares(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Deal Structure — % Cash</label>
              <input
                type="number" placeholder="50" min="0" max="100"
                className="w-full text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                value={dealPercCash} onChange={e => setDealPercCash(e.target.value)}
              />
            </div>
            <div className="flex flex-col justify-end">
              <div className="text-[10px] text-muted-foreground mb-1">EV (mid) · Debt rate 6.5%</div>
              <div className="text-xs font-mono font-semibold text-primary">
                {evMid >= 1000 ? `$${(evMid / 1000).toFixed(1)}B` : `$${evMid.toFixed(0)}M`}
              </div>
            </div>
          </div>

          {canCalc && accretionPct !== null && newEPS !== null && (
            <div className={`rounded-lg p-3 flex items-center justify-between ${
              accretionPct >= 0 ? "bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800" : "bg-red-500/10 border border-red-200 dark:border-red-800"
            }`}>
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Pro Forma EPS</div>
                <div className="text-lg font-bold font-mono">${newEPS.toFixed(2)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">EPS Impact</div>
                <div className={`text-lg font-bold font-mono ${
                  accretionPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                }`}>
                  {accretionPct >= 0 ? "+" : ""}{accretionPct.toFixed(1)}%
                </div>
                <div className={`text-xs font-semibold ${
                  accretionPct >= 0 ? "text-emerald-600" : "text-red-500"
                }`}>
                  {accretionPct >= 0 ? "▲ Accretive" : "▼ Dilutive"}
                </div>
              </div>
            </div>
          )}

          {!canCalc && (
            <div className="text-xs text-muted-foreground text-center py-2">
              Enter acquirer EPS and share count to calculate impact
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">Simplified model — assumes 35% net income conversion, 6.5% debt rate, 15x acquirer P/E for share count.</p>
        </div>
      )}
    </div>
  );
}

// ── Contribution Analysis ─────────────────────────────────────────────────────
function ContributionAnalysis({ revenue, ebitda, evLow, evHigh }: {
  revenue: string; ebitda: string; evLow: number; evHigh: number;
}) {
  const [acqRevenue, setAcqRevenue] = useState("");
  const [acqEBITDA, setAcqEBITDA] = useState("");
  const [expanded, setExpanded] = useState(false);

  const tRev = parseFloat(revenue) || 0;
  const tEbt = parseFloat(ebitda) || 0;
  const aRev = parseFloat(acqRevenue);
  const aEbt = parseFloat(acqEBITDA);
  const canCalc = !isNaN(aRev) && aRev > 0 && !isNaN(aEbt) && aEbt > 0;

  const combRev = canCalc ? aRev + tRev : 0;
  const combEbt = canCalc ? aEbt + tEbt : 0;
  const tRevPct = canCalc ? (tRev / combRev) * 100 : 0;
  const tEbtPct = canCalc ? (tEbt / combEbt) * 100 : 0;
  const evMid = (evLow + evHigh) / 2;
  const evContribPct = canCalc ? (evMid / (evMid + aRev * 2.5)) * 100 : 0; // rough: acquirer at 2.5x rev

  return (
    <div className="rounded-lg border bg-card p-3">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-1.5">
          <Percent size={13} className="text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contribution Analysis</p>
          <span className="text-xs text-muted-foreground ml-1">Target % of combined</span>
        </div>
        {expanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Acquirer Revenue ($M)</label>
              <input type="number" placeholder="e.g. 5000"
                className="w-full text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                value={acqRevenue} onChange={e => setAcqRevenue(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Acquirer EBITDA ($M)</label>
              <input type="number" placeholder="e.g. 1500"
                className="w-full text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                value={acqEBITDA} onChange={e => setAcqEBITDA(e.target.value)} />
            </div>
          </div>

          {canCalc ? (
            <div className="space-y-2">
              {[
                { label: "Revenue", tVal: tRev, cVal: combRev, pct: tRevPct },
                { label: "EBITDA", tVal: tEbt, cVal: combEbt, pct: tEbtPct },
                { label: "EV (approx)", tVal: evMid, cVal: evMid + aRev * 2.5, pct: evContribPct },
              ].map(({ label, tVal, cVal, pct }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-xs font-mono">
                      <span className="font-semibold text-primary">{pct.toFixed(1)}%</span>
                      <span className="text-muted-foreground ml-1">of ${cVal >= 1000 ? `${(cVal/1000).toFixed(1)}B` : `${cVal.toFixed(0)}M`}</span>
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              Enter acquirer financials to see contribution breakdown
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline Comps Strip ────────────────────────────────────────────────────────
const SECTOR_COMPS: Record<string, { name: string; evRev: string; evEBITDA: string; }[]> = {
  saas: [
    { name: "Salesforce",    evRev: "5.8x",  evEBITDA: "22x" },
    { name: "ServiceNow",    evRev: "13.1x", evEBITDA: "48x" },
    { name: "HubSpot",       evRev: "9.2x",  evEBITDA: "64x" },
  ],
  healthcare: [
    { name: "Danaher",       evRev: "5.1x",  evEBITDA: "22x" },
    { name: "Becton Dickinson", evRev: "3.4x", evEBITDA: "14x" },
    { name: "IQVIA",         evRev: "2.8x",  evEBITDA: "17x" },
  ],
  industrials: [
    { name: "Emerson",       evRev: "3.1x",  evEBITDA: "15x" },
    { name: "Parker Hannifin", evRev: "2.6x", evEBITDA: "16x" },
    { name: "Roper Tech",    evRev: "5.9x",  evEBITDA: "24x" },
  ],
  fintech: [
    { name: "Fiserv",        evRev: "4.7x",  evEBITDA: "19x" },
    { name: "Jack Henry",    evRev: "5.3x",  evEBITDA: "25x" },
    { name: "SS&C Tech",     evRev: "3.9x",  evEBITDA: "14x" },
  ],
  consumer: [
    { name: "Kraft Heinz",   evRev: "2.2x",  evEBITDA: "11x" },
    { name: "Hershey",       evRev: "3.4x",  evEBITDA: "17x" },
    { name: "Church & Dwight", evRev: "3.8x", evEBITDA: "21x" },
  ],
  energy: [
    { name: "Pioneer Natural", evRev: "3.1x", evEBITDA: "7x" },
    { name: "Devon Energy",  evRev: "2.8x",  evEBITDA: "6x" },
    { name: "EQT Corp",      evRev: "4.2x",  evEBITDA: "9x" },
  ],
  general: [
    { name: "S&P 500 Median", evRev: "3.2x", evEBITDA: "14x" },
    { name: "Russell 2000 Med.", evRev: "1.9x", evEBITDA: "11x" },
    { name: "Mid-cap M&A Med.", evRev: "2.8x", evEBITDA: "13x" },
  ],
};

function InlineComps({ sectorMode, revenue, ebitda }: { sectorMode: string; revenue: string; ebitda: string }) {
  const comps = SECTOR_COMPS[sectorMode] || SECTOR_COMPS.general;
  const rev = parseFloat(revenue) || 0;
  const ebt = parseFloat(ebitda) || 0;

  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Comparable Public Companies</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left pb-2 font-medium">Company</th>
              <th className="text-right pb-2 font-medium">EV/Rev</th>
              <th className="text-right pb-2 font-medium">EV/EBITDA</th>
              {rev > 0 && <th className="text-right pb-2 font-medium text-primary">Implied EV (Rev)</th>}
              {ebt > 0 && <th className="text-right pb-2 font-medium text-primary">Implied EV (EBITDA)</th>}
            </tr>
          </thead>
          <tbody>
            {comps.map(c => {
              const revMult = parseFloat(c.evRev);
              const ebtMult = parseFloat(c.evEBITDA);
              const impliedRev = rev * revMult;
              const impliedEbt = ebt * ebtMult;
              return (
                <tr key={c.name} className="border-b border-border/40 last:border-0">
                  <td className="py-1.5 font-medium">{c.name}</td>
                  <td className="py-1.5 text-right font-mono">{c.evRev}</td>
                  <td className="py-1.5 text-right font-mono">{c.evEBITDA}</td>
                  {rev > 0 && (
                    <td className="py-1.5 text-right font-mono text-primary">
                      {impliedRev >= 1000 ? `$${(impliedRev/1000).toFixed(1)}B` : `$${impliedRev.toFixed(0)}M`}
                    </td>
                  )}
                  {ebt > 0 && (
                    <td className="py-1.5 text-right font-mono text-primary">
                      {impliedEbt >= 1000 ? `$${(impliedEbt/1000).toFixed(1)}B` : `$${impliedEbt.toFixed(0)}M`}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">NTM multiples · for reference only</p>
    </div>
  );
}

// ── Add to Pipeline Button ────────────────────────────────────────────────────
function AddToPipelineButton({ analysisId, companyName, industry }: { analysisId?: number; companyName: string; industry: string }) {
  const [added, setAdded] = useState(false);
  const { toast } = useToast();
  if (!analysisId) return null;

  const handleAdd = async () => {
    try {
      await apiRequest("POST", "/api/watchlist", {
        company_name: companyName,
        industry,
        analysis_id: analysisId,
        stage: "Screening",
        priority: "Medium",
      });
      setAdded(true);
      toast({ title: `${companyName} added to pipeline` });
    } catch {
      toast({ title: "Failed to add to pipeline", variant: "destructive" });
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleAdd} disabled={added} className="gap-1.5" data-testid="button-add-pipeline">
      {added ? <Check size={13} className="text-emerald-500" /> : <PlusCircle size={13} />}
      {added ? "Added" : "Pipeline"}
    </Button>
  );
}

// ── Run Models Button ─────────────────────────────────────────────────────────
function RunModelsButton({ companyName, revenue, ebitda, evLow, evHigh }: {
  companyName: string; revenue: string; ebitda: string; evLow: number; evHigh: number;
}) {
  const [, navigate] = useLocation();
  const rev = parseFloat(revenue) || 0;
  const ebt = parseFloat(ebitda) || 0;
  const ebitdaMarginPct = rev > 0 ? ((ebt / rev) * 100).toFixed(1) : "22";
  const evMid = ((evLow + evHigh) / 2).toFixed(0);

  const buildParams = (target: "dcf" | "lbo" | "football-field") => {
    const p = new URLSearchParams({
      prefill: "1",
      name: companyName,
      revenue,
      ebitda,
      ebitdaMargin: ebitdaMarginPct,
      evMid,
    });
    return `/${target}?${p.toString()}`;
  };

  return (
    <div className="flex gap-1.5 flex-wrap">
      <Button
        variant="outline" size="sm"
        onClick={() => navigate(buildParams("dcf"))}
        className="gap-1.5 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20"
        data-testid="button-run-dcf"
      >
        <LineChart size={13} />Run DCF
      </Button>
      <Button
        variant="outline" size="sm"
        onClick={() => navigate(buildParams("lbo"))}
        className="gap-1.5 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-900/20"
        data-testid="button-run-lbo"
      >
        <Calculator size={13} />Run LBO
      </Button>
      <Button
        variant="outline" size="sm"
        onClick={() => navigate(buildParams("football-field"))}
        className="gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
        data-testid="button-football-field"
      >
        <Layers size={13} />Football Field
      </Button>
    </div>
  );
}

// ── Results Panel ─────────────────────────────────────────────────────────────
function ResultsPanel({ result, companyName, industry, analysisId, shareToken, revenue, ebitda, sectorMode }: {
  result: AnalysisResult; companyName: string; industry: string; analysisId?: number; shareToken?: string;
  revenue: string; ebitda: string; sectorMode: string;
}) {
  const fitColors = getFitColor(result.fitScore);
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 fade-in-up fade-in-up-1">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">{companyName}</h2>
          <p className="text-sm text-muted-foreground">M&A Target Analysis</p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <ExportButton analysisId={analysisId} companyName={companyName} />
            <ShareButton shareToken={shareToken} />
            <AddToPipelineButton analysisId={analysisId} companyName={companyName} industry={industry} />
            <CSVExportButton result={result} companyName={companyName} revenue={revenue} ebitda={ebitda} />
          </div>
          {revenue && ebitda && (
            <div className="mt-2">
              <RunModelsButton
                companyName={companyName}
                revenue={revenue}
                ebitda={ebitda}
                evLow={result.evRange.low}
                evHigh={result.evRange.high}
              />
            </div>
          )}
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

      {/* Acquirer Rationale */}
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

      {/* Radar */}
      {result.radarScores && <DealRadarChart scores={result.radarScores} />}

      {/* Synergy + LBO */}
      <div className="grid grid-cols-2 gap-3 fade-in-up fade-in-up-4">
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
      <div className="grid grid-cols-1 gap-3 fade-in-up fade-in-up-5">
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle size={13} className="text-emerald-500" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key Strengths</p>
          </div>
          <ul className="space-y-1.5">
            {result.keyStrengths.map((s, i) => (
              <li key={i} className="text-xs flex gap-2">
                <span className="text-emerald-500 mt-0.5 flex-shrink-0">↑</span><span>{s}</span>
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
                <span className="text-amber-500 mt-0.5 flex-shrink-0">↓</span><span>{r}</span>
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
                <span className="flex-shrink-0">⚠</span><span>{f}</span>
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

      {/* ── Analyst Tools ───────────────────────────────────────────────── */}
      <div className="fade-in-up fade-in-up-6">
        <div className="flex items-center gap-2 mb-3 pt-1">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2">Analyst Tools</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="space-y-3">
          <InlineComps sectorMode={sectorMode} revenue={revenue} ebitda={ebitda} />
          <SensitivityTable revenue={revenue} ebitda={ebitda} />
          <AccretionDilution evLow={result.evRange.low} evHigh={result.evRange.high} ebitda={ebitda} />
          <ContributionAnalysis revenue={revenue} ebitda={ebitda} evLow={result.evRange.low} evHigh={result.evRange.high} />
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function AnalysisSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2"><div className="skeleton h-5 w-40 rounded" /><div className="skeleton h-3 w-28 rounded" /></div>
        <div className="skeleton w-28 h-28 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3"><div className="skeleton h-16 rounded-lg" /><div className="skeleton h-16 rounded-lg" /></div>
      <div className="skeleton h-20 rounded-lg" />
      <div className="skeleton h-24 rounded-lg" />
      <div className="skeleton h-52 rounded-lg" />
      <div className="grid grid-cols-2 gap-3"><div className="skeleton h-36 rounded-lg" /><div className="skeleton h-36 rounded-lg" /></div>
      <div className="skeleton h-28 rounded-lg" /><div className="skeleton h-28 rounded-lg" />
      <div className="skeleton h-24 rounded-lg" />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const { toast } = useToast();
  const { user, guestCount, incrementGuestCount } = useAuth();
  const qc = useQueryClient();
  const [activeResult, setActiveResult] = useState<{
    result: AnalysisResult; companyName: string; industry: string; id?: number; shareToken?: string;
    revenue: string; ebitda: string; sectorMode: string;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [authGateOpen, setAuthGateOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "", industry: "", revenue: "", ebitda: "",
      growthRate: "", debtLoad: "", additionalContext: "", sectorMode: "general",
    },
  });

  const { data: recentAnalyses } = useQuery<AnalysisRecord[]>({ queryKey: ["/api/analyses"] });

  const analyzeMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const token = getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Analysis failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setActiveResult({
        result: data.result,
        companyName: form.getValues("companyName"),
        industry: form.getValues("industry"),
        id: data.id,
        shareToken: data.shareToken,
        revenue: form.getValues("revenue"),
        ebitda: form.getValues("ebitda"),
        sectorMode: form.getValues("sectorMode"),
      });
      qc.invalidateQueries({ queryKey: ["/api/analyses"] });
      setIsAnalyzing(false);
    },
    onError: () => {
      toast({ title: "Analysis failed", description: "Please try again.", variant: "destructive" });
      setIsAnalyzing(false);
    },
  });

  const onSubmit = (data: FormValues) => {
    // Gate: prompt login after FREE_LIMIT guest analyses
    if (!user && guestCount >= FREE_LIMIT) {
      setAuthGateOpen(true);
      return;
    }
    setIsAnalyzing(true);
    setActiveResult(null);
    if (!user) incrementGuestCount();
    analyzeMutation.mutate(data);
  };

  // Gate banner — show for guests approaching limit
  const showGateBanner = false;
  const isGated = false;

  // Pre-fill from URL params (from market data page)
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  if (params.get("prefill") === "1" && !form.getValues("companyName") && params.get("name")) {
    form.setValue("companyName", params.get("name") || "");
    form.setValue("industry", params.get("industry") || "");
    form.setValue("revenue", params.get("revenue") || "");
    form.setValue("ebitda", params.get("ebitda") || "");
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto w-full px-4 py-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Left: Input Form ── */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">M&A Target Analysis</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Input company financials to receive an AI-powered deal assessment.
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  {/* Sector Mode */}
                  <FormField
                    control={form.control}
                    name="sectorMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">Sector Mode</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-sector">
                              <SelectValue placeholder="Select sector" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SECTOR_MODES.map(m => (
                              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField control={form.control} name="companyName" render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-xs font-medium">Company Name</FormLabel>
                        <TickerSearch compact onFill={(d: TickerData) => {
                          form.setValue("companyName", d.name);
                          form.setValue("revenue", String(Math.round(d.revenueMM)));
                          form.setValue("ebitda", String(Math.round(d.ebitdaMM)));
                        }} />
                      </div>
                      <FormControl><Input placeholder="e.g. Acme Corp" {...field} data-testid="input-company-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="industry" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Industry / Sector</FormLabel>
                      <FormControl><Input placeholder="e.g. SaaS, Healthcare IT, Industrials" {...field} data-testid="input-industry" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="revenue" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">LTM Revenue ($M)</FormLabel>
                        <FormControl><Input placeholder="250" {...field} data-testid="input-revenue" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="ebitda" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">LTM EBITDA ($M)</FormLabel>
                        <FormControl><Input placeholder="55" {...field} data-testid="input-ebitda" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="growthRate" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">Revenue Growth (%)</FormLabel>
                        <FormControl><Input placeholder="18" {...field} data-testid="input-growth" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="debtLoad" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium">Total Debt ($M)</FormLabel>
                        <FormControl><Input placeholder="80" {...field} data-testid="input-debt" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="additionalContext" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">
                        Additional Context <span className="text-muted-foreground">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g. Market leader in SMB payroll, 90%+ recurring revenue"
                          rows={3} {...field} data-testid="input-context"
                        />
                      </FormControl>
                    </FormItem>
                  )} />

                  {/* Soft sign-up nudge — no gate */}
                  {!user && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                      <button type="button" onClick={() => setAuthGateOpen(true)} className="font-semibold text-primary underline">Sign up free</button> to save your analyses and access deal history.
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={isAnalyzing || isGated} data-testid="button-analyze">
                    {isAnalyzing ? (
                      <><Loader2 size={15} className="mr-2 animate-spin" />Analyzing deal...</>
                    ) : isGated ? (
                      <><BarChart3 size={15} className="mr-2" />Sign Up to Continue</>
                    ) : (
                      <><BarChart3 size={15} className="mr-2" />Run Deal Analysis</>
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
                  {recentAnalyses.slice(0, 8).map((a) => (
                    <li key={a.id}>
                      <button
                        className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted transition-colors text-left"
                        onClick={() => a.result && setActiveResult({
                          result: a.result, companyName: a.companyName,
                          industry: a.industry, id: a.id, shareToken: a.shareToken,
                          revenue: "", ebitda: "", sectorMode: "general",
                        })}
                        data-testid={`button-recent-${a.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 size={12} className="text-muted-foreground flex-shrink-0" />
                          <span className="text-xs font-medium truncate">{a.companyName}</span>
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
                <ResultsPanel
                  result={activeResult.result}
                  companyName={activeResult.companyName}
                  industry={activeResult.industry}
                  analysisId={activeResult.id}
                  shareToken={activeResult.shareToken}
                  revenue={activeResult.revenue}
                  ebitda={activeResult.ebitda}
                  sectorMode={activeResult.sectorMode}
                />
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
                      { label: "Fit Score", desc: "0–100 deal quality" },
                      { label: "EV Range", desc: "Valuation estimate" },
                      { label: "LBO Analysis", desc: "Leverage viability" },
                    ].map(({ label, desc }) => (
                      <div key={label} className="rounded-lg border bg-muted/30 p-3 text-center">
                        <TrendingUp size={16} className="text-primary mx-auto mb-1.5" />
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

      <AuthModal
        open={authGateOpen}
        onClose={() => setAuthGateOpen(false)}
        trigger="gate"
        defaultTab="signup"
      />
    </AppLayout>
  );
}
