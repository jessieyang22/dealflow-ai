import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  GitCompare, Plus, Trash2, Loader2, BarChart3, TrendingUp,
  ChevronUp, ChevronDown, Minus,
} from "lucide-react";
import { TickerSearch, type TickerData } from "@/components/TickerSearch";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import { cn } from "@/lib/utils";

const SECTOR_MODES = [
  { value: "general", label: "General" },
  { value: "saas", label: "SaaS / Cloud" },
  { value: "healthcare", label: "Healthcare / MedTech" },
  { value: "industrials", label: "Industrials" },
  { value: "fintech", label: "FinTech / Financial" },
  { value: "consumer", label: "Consumer / Brands" },
  { value: "energy", label: "Energy / Infrastructure" },
];

interface CompEntry {
  id: string;
  companyName: string;
  industry: string;
  revenue: string;
  ebitda: string;
  growthRate: string;
  debtLoad: string;
  sectorMode: string;
  result?: {
    fitScore: number;
    fitLabel: string;
    acquirerType: string;
    evRange: { low: number; high: number; multipleRange: string };
    synergyPotential: string;
    lboViability: string;
    verdict: string;
  };
  loading?: boolean;
}

function emptyEntry(): CompEntry {
  return {
    id: Math.random().toString(36).slice(2),
    companyName: "", industry: "", revenue: "", ebitda: "",
    growthRate: "", debtLoad: "", sectorMode: "general",
  };
}

function getFitColor(score: number) {
  if (score >= 75) return "#10b981";
  if (score >= 50) return "#3b82f6";
  if (score >= 30) return "#f59e0b";
  return "#ef4444";
}

function formatCurrency(val: number) {
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}B`;
  return `$${val.toFixed(0)}M`;
}

function RankBadge({ rank, total }: { rank: number; total: number }) {
  if (rank === 1) return <span className="text-xs font-bold text-amber-500">#1</span>;
  if (rank === total) return <span className="text-xs font-bold text-red-400">#{rank}</span>;
  return <span className="text-xs font-medium text-muted-foreground">#{rank}</span>;
}

// ── Live Preview (computed from raw inputs before hitting Analyze) ──────────────
function LivePreview({ entry }: { entry: CompEntry }) {
  const rev = parseFloat(entry.revenue) || 0;
  const ebitda = parseFloat(entry.ebitda) || 0;
  const growth = parseFloat(entry.growthRate) || 0;
  const debt = parseFloat(entry.debtLoad) || 0;

  if (!rev || !ebitda) return null;

  const margin = rev > 0 ? (ebitda / rev) * 100 : 0;
  // quick EV estimate: sector-based multiple on EBITDA
  const baseMultiple = entry.sectorMode === "saas" ? 18 : entry.sectorMode === "healthcare" ? 14 :
    entry.sectorMode === "fintech" ? 15 : entry.sectorMode === "industrials" ? 10 :
    entry.sectorMode === "consumer" ? 12 : entry.sectorMode === "energy" ? 9 : 12;
  const growthAdj = Math.min(Math.max((growth - 10) * 0.15, -1.5), 2.0);
  const mult = Math.max(4, baseMultiple + growthAdj);
  const evEst = ebitda * mult - debt;

  return (
    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 space-y-1.5 mt-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/70">Live Preview (est.)</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">EBITDA Margin</span>
          <span className="font-semibold mono">{margin.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">EV/EBITDA</span>
          <span className="font-semibold mono">{mult.toFixed(1)}x</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">EV est.</span>
          <span className="font-semibold mono">{formatCurrency(evEst)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Rev Growth</span>
          <span className="font-semibold mono">{growth.toFixed(1)}%</span>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground italic">Estimate only — run Analyze All for full score</p>
    </div>
  );
}

// ── Entry Form Card ────────────────────────────────────────────────────────────
function EntryCard({
  entry, index, onUpdate, onRemove, canRemove,
}: {
  entry: CompEntry;
  index: number;
  onUpdate: (id: string, data: Partial<CompEntry>) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}) {
  const upd = (key: keyof CompEntry, val: string) => onUpdate(entry.id, { [key]: val });

  const handleTickerFill = (data: TickerData) => {
    const updates: Partial<CompEntry> = {};
    if (data.name) updates.companyName = data.name;
    if (data.industry) updates.industry = data.industry;
    if (data.revenueMM) updates.revenue = String(Math.round(data.revenueMM));
    if (data.ebitdaMM) updates.ebitda = String(Math.round(data.ebitdaMM));
    if (data.netDebtMM != null) updates.debtLoad = String(Math.max(0, Math.round(data.netDebtMM)));
    // derive approximate revenue growth (default 10% — user can adjust)
    onUpdate(entry.id, updates);
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-primary uppercase tracking-wide">
          Company {index + 1}
        </span>
        <div className="flex items-center gap-2">
          <TickerSearch onFill={handleTickerFill} compact data-testid={`comps-ticker-${index}`} />
          {canRemove && (
            <button
              onClick={() => onRemove(entry.id)}
              className="p-1 rounded hover:bg-destructive/10 transition-colors"
              data-testid={`comps-remove-${index}`}
            >
              <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Company Name</label>
        <Input
          placeholder="Acme Corp" value={entry.companyName}
          onChange={e => upd("companyName", e.target.value)}
          className="mt-1 h-8 text-sm"
          data-testid={`comps-name-${index}`}
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Industry</label>
        <Input
          placeholder="SaaS, Healthcare..." value={entry.industry}
          onChange={e => upd("industry", e.target.value)}
          className="mt-1 h-8 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Revenue ($M)</label>
          <Input placeholder="250" value={entry.revenue} onChange={e => upd("revenue", e.target.value)} className="mt-1 h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">EBITDA ($M)</label>
          <Input placeholder="55" value={entry.ebitda} onChange={e => upd("ebitda", e.target.value)} className="mt-1 h-8 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Growth (%)</label>
          <Input placeholder="18" value={entry.growthRate} onChange={e => upd("growthRate", e.target.value)} className="mt-1 h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Debt ($M)</label>
          <Input placeholder="80" value={entry.debtLoad} onChange={e => upd("debtLoad", e.target.value)} className="mt-1 h-8 text-sm" />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Sector Mode</label>
        <Select value={entry.sectorMode} onValueChange={v => upd("sectorMode", v)}>
          <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SECTOR_MODES.map(m => <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Live preview (before analysis) */}
      {!entry.result && !entry.loading && <LivePreview entry={entry} />}

      {/* Result mini-preview */}
      {entry.loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 size={12} className="animate-spin" />Analyzing...
        </div>
      )}
      {entry.result && (
        <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Fit Score</span>
            <span
              className="text-lg font-bold mono"
              style={{ color: getFitColor(entry.result.fitScore) }}
            >
              {entry.result.fitScore}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">EV Range</span>
            <span className="text-xs font-semibold mono">
              {formatCurrency(entry.result.evRange.low)} – {formatCurrency(entry.result.evRange.high)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Multiple</span>
            <span className="text-xs mono text-primary">{entry.result.evRange.multipleRange}</span>
          </div>
          <div className="flex gap-1.5 flex-wrap mt-1">
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded",
              entry.result.synergyPotential === "High" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
              entry.result.synergyPotential === "Medium" ? "bg-blue-500/15 text-blue-500" :
              "bg-muted text-muted-foreground"
            )}>
              {entry.result.synergyPotential} Synergy
            </span>
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded",
              entry.result.lboViability.includes("Strong") ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
              entry.result.lboViability.includes("Moderate") ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
              "bg-red-500/15 text-red-500"
            )}>
              {entry.result.lboViability.replace(" Candidate", "")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Comparison Table ───────────────────────────────────────────────────────────
function ComparisonTable({ entries }: { entries: CompEntry[] }) {
  const analyzed = entries.filter(e => e.result);
  if (analyzed.length < 2) return null;

  const ranked = [...analyzed].sort((a, b) => (b.result!.fitScore) - (a.result!.fitScore));

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h2 className="text-sm font-semibold">Side-by-Side Comparison</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Ranked by fit score</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Rank</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Company</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Fit Score</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">EV Low</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">EV High</th>
              <th className="text-center px-4 py-2 font-medium text-muted-foreground">Multiple</th>
              <th className="text-center px-4 py-2 font-medium text-muted-foreground">Synergy</th>
              <th className="text-center px-4 py-2 font-medium text-muted-foreground">LBO</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((entry, i) => (
              <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <RankBadge rank={i + 1} total={ranked.length} />
                </td>
                <td className="px-4 py-3 font-medium">{entry.companyName}</td>
                <td className="px-4 py-3 text-right">
                  <span className="font-bold mono" style={{ color: getFitColor(entry.result!.fitScore) }}>
                    {entry.result!.fitScore}
                  </span>
                </td>
                <td className="px-4 py-3 text-right mono">{formatCurrency(entry.result!.evRange.low)}</td>
                <td className="px-4 py-3 text-right mono">{formatCurrency(entry.result!.evRange.high)}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded mono">
                    {entry.result!.evRange.multipleRange}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    entry.result!.synergyPotential === "High" ? "text-emerald-600 dark:text-emerald-400" :
                    entry.result!.synergyPotential === "Medium" ? "text-blue-500" : "text-muted-foreground"
                  )}>
                    {entry.result!.synergyPotential}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={cn(
                    "text-xs",
                    entry.result!.lboViability.includes("Strong") ? "text-emerald-600 dark:text-emerald-400" :
                    entry.result!.lboViability.includes("Moderate") ? "text-amber-500" : "text-red-500"
                  )}>
                    {entry.result!.lboViability.includes("Strong") ? "Strong" :
                     entry.result!.lboViability.includes("Moderate") ? "Moderate" : "Weak"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bar chart */}
      <div className="px-4 py-4 border-t">
        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Fit Score Comparison</p>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={ranked.map(e => ({ name: e.companyName, score: e.result!.fitScore }))} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
              formatter={(val: number) => [`${val} / 100`, "Fit Score"]}
            />
            <Bar dataKey="score" radius={[4, 4, 0, 0]}>
              {ranked.map((entry) => (
                <Cell key={entry.id} fill={getFitColor(entry.result!.fitScore)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Comps() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<CompEntry[]>([emptyEntry(), emptyEntry()]);

  const updateEntry = (id: string, data: Partial<CompEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
  };

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const addEntry = () => {
    if (entries.length >= 5) return;
    setEntries(prev => [...prev, emptyEntry()]);
  };

  const analyzeAll = async () => {
    const valid = entries.filter(e =>
      e.companyName && e.industry && e.revenue && e.ebitda && e.growthRate && e.debtLoad
    );
    if (valid.length < 2) {
      toast({ title: "Fill in at least 2 companies", variant: "destructive" });
      return;
    }

    // Mark all valid as loading
    setEntries(prev => prev.map(e =>
      valid.find(v => v.id === e.id) ? { ...e, loading: true, result: undefined } : e
    ));

    // Fire all in parallel
    const promises = valid.map(async (entry) => {
      try {
        const res = await apiRequest("POST", "/api/analyze", {
          companyName: entry.companyName,
          industry: entry.industry,
          revenue: entry.revenue,
          ebitda: entry.ebitda,
          growthRate: entry.growthRate,
          debtLoad: entry.debtLoad,
          sectorMode: entry.sectorMode,
        });
        const data = await res.json();
        setEntries(prev => prev.map(e =>
          e.id === entry.id ? { ...e, loading: false, result: data.result } : e
        ));
      } catch {
        setEntries(prev => prev.map(e =>
          e.id === entry.id ? { ...e, loading: false } : e
        ));
        toast({ title: `Analysis failed for ${entry.companyName}`, variant: "destructive" });
      }
    });

    await Promise.all(promises);
  };

  const allValid = entries.filter(e =>
    e.companyName && e.industry && e.revenue && e.ebitda && e.growthRate && e.debtLoad
  ).length >= 2;

  const anyLoading = entries.some(e => e.loading);
  const anyResults = entries.some(e => e.result);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GitCompare size={18} className="text-primary" />
              <h1 className="text-xl font-bold tracking-tight">Comparable Company Screen</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Analyze up to 5 targets side-by-side. Compare fit scores, EV ranges, and deal quality.
            </p>
          </div>
          <div className="flex gap-2">
            {entries.length < 5 && (
              <Button variant="outline" size="sm" onClick={addEntry} className="gap-1.5">
                <Plus size={13} />Add Company
              </Button>
            )}
            <div className="flex flex-col items-end gap-1">
              <Button
                size="sm"
                disabled={!allValid || anyLoading}
                onClick={analyzeAll}
                className="gap-1.5"
                data-testid="comps-analyze-btn"
              >
                {anyLoading ? (
                  <><Loader2 size={13} className="animate-spin" />Analyzing...</>
                ) : (
                  <><BarChart3 size={13} />Analyze All</>
                )}
              </Button>
              {!allValid && (
                <p className="text-[10px] text-muted-foreground">
                  Fill in at least 2 companies to run
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Entry Cards */}
        <div className={cn(
          "grid gap-4 mb-6",
          entries.length <= 2 ? "grid-cols-1 md:grid-cols-2" :
          entries.length <= 3 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" :
          "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
        )}>
          {entries.map((entry, i) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              index={i}
              onUpdate={updateEntry}
              onRemove={removeEntry}
              canRemove={entries.length > 2}
            />
          ))}
        </div>

        {/* Comparison Table */}
        {anyResults && <ComparisonTable entries={entries} />}
      </div>
    </AppLayout>
  );
}
