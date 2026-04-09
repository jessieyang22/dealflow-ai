/**
 * Synergy Calculator
 * Revenue synergies, cost synergies, one-time costs, NPV of synergy stream.
 * The standard framework used in strategic M&A advisory.
 */
import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { TickerSearch, type TickerData } from "@/components/TickerSearch";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend,
} from "recharts";
import { GitMerge, TrendingUp, AlertTriangle, DollarSign, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function npv(cashflow: number, wacc: number, years: number) {
  // Simple PV of perpetuity with year-1 ramp
  let total = 0;
  for (let y = 1; y <= years; y++) {
    const ramp = Math.min(1, y / 2); // 50% year 1, 100% year 2+
    total += (cashflow * ramp) / Math.pow(1 + wacc / 100, y);
  }
  // Terminal value at exit year
  const tv = (cashflow / (wacc / 100)) / Math.pow(1 + wacc / 100, years);
  return total + tv;
}

// ─── component ──────────────────────────────────────────────────────────────

export default function SynergyCalculator() {
  const [acqName, setAcqName] = useState("");
  const [tgtName, setTgtName] = useState("");
  const [acqRevenue, setAcqRevenue] = useState("2000");
  const [tgtRevenue, setTgtRevenue] = useState("800");

  // Revenue synergies (by category)
  const [crossSell, setCrossSell] = useState("40");
  const [pricingPower, setPricingPower] = useState("15");
  const [newMarkets, setNewMarkets] = useState("20");

  // Cost synergies
  const [sgaElim, setSgaElim] = useState("35");
  const [cogs, setCogs] = useState("20");
  const [itInfra, setItInfra] = useState("15");
  const [headcount, setHeadcount] = useState("25");

  // One-time integration costs
  const [integCost, setIntegCost] = useState("80");
  const [restructuring, setRestructuring] = useState("30");

  // Assumptions
  const [taxRate, setTaxRate] = useState("25");
  const [wacc, setWacc] = useState("10");
  const [realizationPct, setRealizationPct] = useState(75); // % likely to be realized

  const result = useMemo(() => {
    const p = (s: string) => (parseFloat(s) || 0) * 1e6;

    const revSyn = p(crossSell) + p(pricingPower) + p(newMarkets);
    const costSyn = p(sgaElim) + p(cogs) + p(itInfra) + p(headcount);
    const totalGross = revSyn + costSyn;
    const tax = parseFloat(taxRate) || 25;
    const discount = parseFloat(wacc) || 10;
    const realization = realizationPct / 100;

    const totalAfterTax = totalGross * (1 - tax / 100) * realization;
    const oneTimeCosts = p(integCost) + p(restructuring);

    const synergyNPV = npv(totalAfterTax, discount, 10);
    const netNPV = synergyNPV - oneTimeCosts;

    const breakeven = totalAfterTax > 0 ? oneTimeCosts / totalAfterTax : null;

    const combinedRev = (parseFloat(acqRevenue) + parseFloat(tgtRevenue)) * 1e6;
    const revSynPct = combinedRev > 0 ? (revSyn / combinedRev) * 100 : 0;
    const costSynPct = combinedRev > 0 ? (costSyn / combinedRev) * 100 : 0;

    // Year-by-year bridge (5 years)
    const yearlyData = [1, 2, 3, 4, 5].map(yr => {
      const ramp = Math.min(1, yr / 2);
      const revR = revSyn * ramp * realization * (1 - tax / 100);
      const costR = costSyn * ramp * realization * (1 - tax / 100);
      const costs = yr === 1 ? -oneTimeCosts : yr === 2 ? -oneTimeCosts * 0.2 : 0;
      return {
        year: `Y${yr}`,
        "Rev. Synergies (est.)": revR / 1e6,
        "Cost Synergies (est.)": costR / 1e6,
        "Integration Costs": costs / 1e6,
      };
    });

    return {
      revSyn, costSyn, totalGross, totalAfterTax,
      oneTimeCosts, synergyNPV, netNPV,
      breakeven, revSynPct, costSynPct, yearlyData,
    };
  }, [crossSell, pricingPower, newMarkets, sgaElim, cogs, itInfra, headcount,
      integCost, restructuring, taxRate, wacc, realizationPct, acqRevenue, tgtRevenue]);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <GitMerge size={18} className="text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Synergy Calculator</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Model the revenue synergies, cost synergies, and integration costs for a proposed combination.{" "}
            <span className="italic text-xs">est. — simplified, for illustrative purposes only</span>
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

          {/* ── Inputs ── */}
          <div className="xl:col-span-2 space-y-4">

            {/* Entities */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Entities</p>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs">Acquirer</Label>
                    <TickerSearch onFill={(d: TickerData) => { if (d.name) setAcqName(d.name); if (d.revenueMM) setAcqRevenue(String(Math.round(d.revenueMM))); }} compact />
                  </div>
                  <Input value={acqName} onChange={e => setAcqName(e.target.value)} placeholder="Acquirer name" className="h-8 text-sm mb-2" />
                  <div className="flex gap-2 items-center">
                    <Label className="text-xs shrink-0">Revenue ($M)</Label>
                    <Input value={acqRevenue} onChange={e => setAcqRevenue(e.target.value)} placeholder="2000" className="h-8 text-sm" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs">Target</Label>
                    <TickerSearch onFill={(d: TickerData) => { if (d.name) setTgtName(d.name); if (d.revenueMM) setTgtRevenue(String(Math.round(d.revenueMM))); }} compact />
                  </div>
                  <Input value={tgtName} onChange={e => setTgtName(e.target.value)} placeholder="Target name" className="h-8 text-sm mb-2" />
                  <div className="flex gap-2 items-center">
                    <Label className="text-xs shrink-0">Revenue ($M)</Label>
                    <Input value={tgtRevenue} onChange={e => setTgtRevenue(e.target.value)} placeholder="800" className="h-8 text-sm" />
                  </div>
                </div>
              </div>
            </div>

            {/* Revenue Synergies */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-1.5 mb-4">
                <TrendingUp size={13} className="text-emerald-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Revenue Synergies ($M/yr)</p>
              </div>
              <div className="space-y-3">
                {[
                  { label: "Cross-sell / upsell", val: crossSell, set: setCrossSell, id: "cross-sell" },
                  { label: "Pricing power", val: pricingPower, set: setPricingPower, id: "pricing" },
                  { label: "New markets / geographies", val: newMarkets, set: setNewMarkets, id: "new-markets" },
                ].map(({ label, val, set, id }) => (
                  <div key={id} className="flex items-center gap-3">
                    <Label className="text-xs w-40 shrink-0">{label}</Label>
                    <Input value={val} onChange={e => set(e.target.value)} placeholder="0" className="h-8 text-sm" data-testid={id} />
                  </div>
                ))}
              </div>
            </div>

            {/* Cost Synergies */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-1.5 mb-4">
                <DollarSign size={13} className="text-blue-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cost Synergies ($M/yr)</p>
              </div>
              <div className="space-y-3">
                {[
                  { label: "SG&A elimination", val: sgaElim, set: setSgaElim, id: "sga" },
                  { label: "COGS / procurement", val: cogs, set: setCogs, id: "cogs" },
                  { label: "IT / infrastructure", val: itInfra, set: setItInfra, id: "it" },
                  { label: "Headcount / facilities", val: headcount, set: setHeadcount, id: "headcount" },
                ].map(({ label, val, set, id }) => (
                  <div key={id} className="flex items-center gap-3">
                    <Label className="text-xs w-40 shrink-0">{label}</Label>
                    <Input value={val} onChange={e => set(e.target.value)} placeholder="0" className="h-8 text-sm" data-testid={id} />
                  </div>
                ))}
              </div>
            </div>

            {/* One-time costs */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-1.5 mb-4">
                <AlertTriangle size={13} className="text-amber-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">One-Time Integration Costs ($M)</p>
              </div>
              <div className="space-y-3">
                {[
                  { label: "Integration / systems", val: integCost, set: setIntegCost, id: "integ" },
                  { label: "Restructuring / severance", val: restructuring, set: setRestructuring, id: "restr" },
                ].map(({ label, val, set, id }) => (
                  <div key={id} className="flex items-center gap-3">
                    <Label className="text-xs w-40 shrink-0">{label}</Label>
                    <Input value={val} onChange={e => set(e.target.value)} placeholder="0" className="h-8 text-sm" data-testid={id} />
                  </div>
                ))}
              </div>
            </div>

            {/* Assumptions */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assumptions</p>
              <div>
                <div className="flex justify-between mb-1">
                  <Label className="text-xs">Realization Rate</Label>
                  <span className="text-xs font-semibold text-primary">{realizationPct}%</span>
                </div>
                <Slider min={25} max={100} step={5} value={[realizationPct]} onValueChange={([v]) => setRealizationPct(v)} />
                <p className="text-[10px] text-muted-foreground mt-1">Probability-weighted % of modeled synergies actually realized</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">WACC (%)</Label>
                  <Input value={wacc} onChange={e => setWacc(e.target.value)} placeholder="10" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Tax Rate (%)</Label>
                  <Input value={taxRate} onChange={e => setTaxRate(e.target.value)} placeholder="25" className="h-8 text-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Output ── */}
          <div className="xl:col-span-3 space-y-4">

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Rev. Synergies (est.)", val: fmt(result.revSyn), sub: `${result.revSynPct.toFixed(1)}% of combined rev.`, color: "text-emerald-600 dark:text-emerald-400" },
                { label: "Cost Synergies (est.)", val: fmt(result.costSyn), sub: `${result.costSynPct.toFixed(1)}% of combined rev.`, color: "text-blue-600 dark:text-blue-400" },
                { label: "One-Time Costs (est.)", val: fmt(result.oneTimeCosts), sub: `${result.breakeven ? result.breakeven.toFixed(1) + "yr payback" : "—"}`, color: "text-amber-600" },
                { label: "Synergy NPV (est.)", val: fmt(result.netNPV), sub: "After-tax, after costs", color: result.netNPV > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500" },
              ].map(({ label, val, sub, color }) => (
                <div key={label} className="rounded-xl border bg-card p-4">
                  <p className="text-[10px] text-muted-foreground leading-tight mb-2">{label}</p>
                  <p className={cn("text-lg font-bold", color)}>{val}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
                </div>
              ))}
            </div>

            {/* Synergy bridge bar chart */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                5-Year Synergy Ramp <span className="italic normal-case font-normal">(est. — after-tax, {realizationPct}% realization)</span>
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={result.yearlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}M`} domain={['auto', 'auto']} />
                  <Tooltip
                    formatter={(val: number) => [`$${Math.abs(val).toFixed(0)}M`, undefined]}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Rev. Synergies (est.)" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Cost Synergies (est.)" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Integration Costs" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Waterfall table */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                Synergy Bridge <span className="italic normal-case font-normal">(est. — run-rate, after-tax)</span>
              </p>
              <div className="space-y-1.5">
                {[
                  { label: "Cross-sell / upsell (est.)", val: (parseFloat(crossSell) || 0) * (1 - (parseFloat(taxRate) || 25) / 100) * (realizationPct / 100), color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Pricing power (est.)", val: (parseFloat(pricingPower) || 0) * (1 - (parseFloat(taxRate) || 25) / 100) * (realizationPct / 100), color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "New markets (est.)", val: (parseFloat(newMarkets) || 0) * (1 - (parseFloat(taxRate) || 25) / 100) * (realizationPct / 100), color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "SG&A elimination (est.)", val: (parseFloat(sgaElim) || 0) * (1 - (parseFloat(taxRate) || 25) / 100) * (realizationPct / 100), color: "text-blue-600 dark:text-blue-400" },
                  { label: "COGS / procurement (est.)", val: (parseFloat(cogs) || 0) * (1 - (parseFloat(taxRate) || 25) / 100) * (realizationPct / 100), color: "text-blue-600 dark:text-blue-400" },
                  { label: "IT / infrastructure (est.)", val: (parseFloat(itInfra) || 0) * (1 - (parseFloat(taxRate) || 25) / 100) * (realizationPct / 100), color: "text-blue-600 dark:text-blue-400" },
                  { label: "Headcount / facilities (est.)", val: (parseFloat(headcount) || 0) * (1 - (parseFloat(taxRate) || 25) / 100) * (realizationPct / 100), color: "text-blue-600 dark:text-blue-400" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="flex justify-between text-xs py-1 border-b last:border-0 last:pb-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={cn("font-semibold", color)}>${val.toFixed(0)}M</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs py-2 font-bold border-t-2 mt-1">
                  <span>Total Run-Rate After-Tax (est.)</span>
                  <span className={result.totalAfterTax > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
                    ${(result.totalAfterTax / 1e6).toFixed(0)}M
                  </span>
                </div>
                <div className="flex justify-between text-xs py-1 text-red-500">
                  <span>One-time integration costs (est.)</span>
                  <span>-${(result.oneTimeCosts / 1e6).toFixed(0)}M</span>
                </div>
                <div className="flex justify-between text-sm py-2 font-bold border-t">
                  <span>Net Synergy NPV (est.)</span>
                  <span className={result.netNPV > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
                    {fmt(result.netNPV)}
                  </span>
                </div>
              </div>
            </div>

            {/* Methodology note */}
            <div className="rounded-xl border bg-muted/30 p-4 flex gap-3">
              <Info size={14} className="text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-semibold">Methodology (est. — simplified):</span>{" "}
                Synergy NPV = PV of after-tax run-rate synergies (ramping over 2 years) + terminal value at WACC, minus one-time costs.
                Realization rate reflects probability-weighted haircut on modeled synergies.
                Year 2+ costs reflect ~20% tail integration spend. Not investment advice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
