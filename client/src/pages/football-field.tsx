import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  BarChart2, TrendingUp, TrendingDown, Calculator,
  Layers, ArrowRight, Info, Download, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Cell, Legend, LabelList,
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtM(n: number, dec = 1) {
  if (!isFinite(n) || isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}T`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(dec)}B`;
  return `$${n.toFixed(0)}M`;
}

function fmtShare(n: number) {
  if (!isFinite(n) || isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number, dec = 1) {
  if (!isFinite(n) || isNaN(n)) return "—";
  return `${n.toFixed(dec)}%`;
}

function fmtMult(n: number) {
  if (!isFinite(n) || isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

// ── DCF Engine ────────────────────────────────────────────────────────────────

const FORECAST_YEARS = 5;

function runDCF(inputs: {
  revenue: number; revenueGrowth: number; ebitdaMargin: number;
  daPercent: number; capexPercent: number; nwcPercent: number;
  taxRate: number; wacc: number; terminalMult: number;
  netDebt: number; sharesOut: number;
}): { impliedSharePrice: number; enterpriseValue: number; equityValue: number } | null {
  const { revenue, revenueGrowth, ebitdaMargin, daPercent, capexPercent,
    nwcPercent, taxRate, wacc, terminalMult, netDebt, sharesOut } = inputs;

  if (wacc <= 0 || revenue <= 0 || sharesOut <= 0) return null;

  let prevRevenue = revenue;
  let totalPVFCF = 0;
  let terminalEBITDA = 0;

  for (let y = 1; y <= FORECAST_YEARS; y++) {
    const rev = prevRevenue * (1 + revenueGrowth);
    const ebitda = rev * ebitdaMargin;
    const da = rev * daPercent;
    const ebit = ebitda - da;
    const nopat = ebit * (1 - taxRate);
    const capex = rev * capexPercent;
    const nwcChange = (rev - prevRevenue) * nwcPercent;
    const fcf = nopat + da - capex - nwcChange;
    const pvFCF = fcf / Math.pow(1 + wacc, y);
    totalPVFCF += pvFCF;
    terminalEBITDA = ebitda;
    prevRevenue = rev;
  }

  const terminalValue = terminalEBITDA * terminalMult;
  const pvTerminal = terminalValue / Math.pow(1 + wacc, FORECAST_YEARS);
  const enterpriseValue = totalPVFCF + pvTerminal;
  const equityValue = enterpriseValue - netDebt;
  const impliedSharePrice = equityValue / sharesOut;

  return { impliedSharePrice, enterpriseValue, equityValue };
}

// ── LBO Engine ────────────────────────────────────────────────────────────────

function runLBO(inputs: {
  ebitda: number; entryMult: number; debtMult: number;
  interestRate: number; ebitdaGrowth: number; exitMult: number; holdYears: number;
}): { irr: number; moic: number; exitEV: number; equityIn: number; equityOut: number } | null {
  const { ebitda, entryMult, debtMult, interestRate, ebitdaGrowth, exitMult, holdYears } = inputs;

  const entryEV = ebitda * entryMult;
  const totalDebt = ebitda * debtMult;
  const equityIn = entryEV - totalDebt;
  if (equityIn <= 0) return null;

  let ebitdaT = ebitda;
  let remainingDebt = totalDebt;

  for (let y = 1; y <= holdYears; y++) {
    ebitdaT *= (1 + ebitdaGrowth);
    const interest = remainingDebt * interestRate;
    const fcf = ebitdaT * 0.50 - interest;
    const paid = Math.max(0, fcf * 0.30);
    remainingDebt = Math.max(0, remainingDebt - paid);
  }

  const exitEV = ebitdaT * exitMult;
  const equityOut = Math.max(0, exitEV - remainingDebt);
  const moic = equityOut / equityIn;
  const irr = (Math.pow(moic, 1 / holdYears) - 1) * 100;

  return { irr, moic, exitEV, equityIn, equityOut };
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────

function FootballTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card shadow-md px-3 py-2 text-xs space-y-1">
      <p className="font-semibold text-foreground">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-mono font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Football Field Chart ───────────────────────────────────────────────────────

interface ValuationBand {
  methodology: string;
  low: number;
  high: number;
  midLabel: string;
  color: string;
}

function FootballFieldChart({
  bands, currentPrice,
}: { bands: ValuationBand[]; currentPrice: number }) {
  // Transform into range-bar chart: each bar is [low, high] relative to share price
  const data = bands.map(b => ({
    name: b.methodology,
    // We render the bar as a stacked: transparent base up to low, then colored range
    base: parseFloat(b.low.toFixed(2)),
    range: parseFloat((b.high - b.low).toFixed(2)),
    low: b.low,
    high: b.high,
    mid: (b.low + b.high) / 2,
    color: b.color,
    midLabel: b.midLabel,
  }));

  const allPrices = [currentPrice, ...bands.map(b => b.low), ...bands.map(b => b.high)].filter(isFinite);
  const domainMin = Math.max(0, Math.min(...allPrices) * 0.85);
  const domainMax = Math.max(...allPrices) * 1.15;

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} layout="vertical" margin={{ top: 8, right: 60, bottom: 8, left: 120 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            domain={[domainMin, domainMax]}
            tickFormatter={v => `$${v.toFixed(0)}`}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={112}
            tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
          />
          <Tooltip content={<FootballTooltip />} />

          {/* Invisible base bar */}
          <Bar dataKey="base" stackId="a" fill="transparent" radius={0} isAnimationActive={false}>
            {data.map((_, i) => <Cell key={i} fill="transparent" />)}
          </Bar>

          {/* Colored range bar */}
          <Bar dataKey="range" stackId="a" radius={[0, 4, 4, 0]} isAnimationActive={false}
            label={false}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} fillOpacity={0.85} />
            ))}
            <LabelList
              dataKey="mid"
              position="right"
              formatter={(v: number) => fmtShare(v)}
              style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontWeight: 600, fontFamily: "monospace" }}
            />
          </Bar>

          {/* Current price reference line */}
          {isFinite(currentPrice) && currentPrice > 0 && (
            <ReferenceLine
              x={currentPrice}
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              strokeDasharray="4 2"
              label={{
                value: `Current ${fmtShare(currentPrice)}`,
                position: "top",
                fontSize: 10,
                fill: "hsl(var(--primary))",
                fontWeight: 600,
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Summary Cards ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold mono ${accent || "text-primary"}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function FootballField() {
  // Parse URL prefill
  const prefillParams = useMemo(() => {
    const hash = window.location.hash || "";
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return null;
    const p = new URLSearchParams(hash.slice(qIdx + 1));
    if (p.get("prefill") !== "1") return null;
    return {
      revenue: p.get("revenue") || "",
      ebitdaMargin: p.get("ebitdaMargin") || p.get("ebitda") || "",
      ebitda: p.get("ebitda") || "",
      companyName: p.get("name") || "",
      evMid: p.get("evMid") || "",
    };
  }, []);

  // Shared company inputs
  const [companyName, setCompanyName] = useState(prefillParams?.companyName || "Target Co.");
  const [revenue, setRevenue] = useState(prefillParams?.revenue || "500");
  const [ebitdaRaw, setEbitdaRaw] = useState(prefillParams?.ebitda || "110");
  const [currentPrice, setCurrentPrice] = useState("45.00");
  const [sharesOut, setSharesOut] = useState("100");
  const [netDebt, setNetDebt] = useState("200");
  const [taxRate, setTaxRate] = useState("25");

  // DCF inputs
  const [revenueGrowth, setRevenueGrowth] = useState("15");
  const [dcfWaccLow, setDcfWaccLow] = useState("9");
  const [dcfWaccHigh, setDcfWaccHigh] = useState("11");
  const [terminalMultLow, setTerminalMultLow] = useState("10");
  const [terminalMultHigh, setTerminalMultHigh] = useState("14");
  const [daPercent, setDaPercent] = useState("4");
  const [capexPercent, setCapexPercent] = useState("5");
  const [nwcPercent, setNwcPercent] = useState("5");

  // LBO inputs
  const [entryMult, setEntryMult] = useState("10");
  const [debtMult, setDebtMult] = useState("5");
  const [interestRate, setInterestRate] = useState("7.5");
  const [ebitdaGrowth, setEbitdaGrowth] = useState("8");
  const [exitMultLow, setExitMultLow] = useState("9");
  const [exitMultHigh, setExitMultHigh] = useState("12");
  const [holdYears, setHoldYears] = useState(5);

  // Comps/Precedents range (analyst enters manually — from comps page or precedents DB)
  const [compsEvLow, setCompsEvLow] = useState("");
  const [compsEvHigh, setCompsEvHigh] = useState("");
  const [precEvLow, setPrecEvLow] = useState("");
  const [precEvHigh, setPrecEvHigh] = useState("");

  // Advanced toggle
  const [showAdv, setShowAdv] = useState(false);

  // ── Derived ────────────────────────────────────────────────────────────────

  const rev = parseFloat(revenue) || 0;
  const ebt = parseFloat(ebitdaRaw) || 0;
  const ebitdaMarginPct = rev > 0 ? ebt / rev : 0.22;
  const curPrice = parseFloat(currentPrice) || 0;
  const shares = parseFloat(sharesOut) || 0;
  const nd = parseFloat(netDebt) || 0;
  const tax = (parseFloat(taxRate) || 25) / 100;
  const gr = (parseFloat(revenueGrowth) || 0) / 100;
  const da = (parseFloat(daPercent) || 4) / 100;
  const capex = (parseFloat(capexPercent) || 5) / 100;
  const nwc = (parseFloat(nwcPercent) || 5) / 100;

  const dcfInputBase = {
    revenue: rev, revenueGrowth: gr, ebitdaMargin: ebitdaMarginPct,
    daPercent: da, capexPercent: capex, nwcPercent: nwc,
    taxRate: tax, netDebt: nd, sharesOut: shares,
  };

  // DCF bear/bull
  const dcfBear = runDCF({ ...dcfInputBase, wacc: (parseFloat(dcfWaccHigh) || 11) / 100, terminalMult: parseFloat(terminalMultLow) || 10 });
  const dcfBull = runDCF({ ...dcfInputBase, wacc: (parseFloat(dcfWaccLow) || 9) / 100, terminalMult: parseFloat(terminalMultHigh) || 14 });

  // LBO exit scenarios
  const lboBase = {
    ebitda: ebt,
    entryMult: parseFloat(entryMult) || 10,
    debtMult: parseFloat(debtMult) || 5,
    interestRate: (parseFloat(interestRate) || 7.5) / 100,
    ebitdaGrowth: (parseFloat(ebitdaGrowth) || 8) / 100,
    holdYears,
  };
  const lboBear = runLBO({ ...lboBase, exitMult: parseFloat(exitMultLow) || 9 });
  const lboBull = runLBO({ ...lboBase, exitMult: parseFloat(exitMultHigh) || 12 });

  // Convert LBO exit equity → implied share price (equity/shares)
  const lboBearPrice = lboBear && shares > 0 ? (lboBear.equityOut - nd) / shares : NaN;
  const lboBullPrice = lboBull && shares > 0 ? (lboBull.equityOut - nd) / shares : NaN;

  // Comps/Precedents → implied share price from EV
  const compsLowEV = parseFloat(compsEvLow) || NaN;
  const compsHighEV = parseFloat(compsEvHigh) || NaN;
  const precLowEV = parseFloat(precEvLow) || NaN;
  const precHighEV = parseFloat(precEvHigh) || NaN;

  const evToPrice = (ev: number) => shares > 0 ? (ev - nd) / shares : NaN;

  // ── Valuation Bands ────────────────────────────────────────────────────────

  const bands: ValuationBand[] = useMemo(() => {
    const list: ValuationBand[] = [];

    if (dcfBear && dcfBull) {
      const lo = Math.min(dcfBear.impliedSharePrice, dcfBull.impliedSharePrice);
      const hi = Math.max(dcfBear.impliedSharePrice, dcfBull.impliedSharePrice);
      list.push({
        methodology: "DCF (est.)",
        low: parseFloat(lo.toFixed(2)),
        high: parseFloat(hi.toFixed(2)),
        midLabel: fmtShare((lo + hi) / 2),
        color: "hsl(217, 91%, 60%)",  // blue
      });
    }

    if (lboBear && lboBull && isFinite(lboBearPrice) && isFinite(lboBullPrice)) {
      const lo = Math.min(lboBearPrice, lboBullPrice);
      const hi = Math.max(lboBearPrice, lboBullPrice);
      list.push({
        methodology: "LBO (est.)",
        low: parseFloat(lo.toFixed(2)),
        high: parseFloat(hi.toFixed(2)),
        midLabel: fmtShare((lo + hi) / 2),
        color: "hsl(262, 80%, 60%)",  // violet
      });
    }

    if (isFinite(compsLowEV) && isFinite(compsHighEV)) {
      const lo = evToPrice(compsLowEV);
      const hi = evToPrice(compsHighEV);
      if (isFinite(lo) && isFinite(hi)) {
        list.push({
          methodology: "Trading Comps",
          low: parseFloat(Math.min(lo, hi).toFixed(2)),
          high: parseFloat(Math.max(lo, hi).toFixed(2)),
          midLabel: fmtShare((lo + hi) / 2),
          color: "hsl(142, 72%, 42%)",  // green
        });
      }
    }

    if (isFinite(precLowEV) && isFinite(precHighEV)) {
      const lo = evToPrice(precLowEV);
      const hi = evToPrice(precHighEV);
      if (isFinite(lo) && isFinite(hi)) {
        list.push({
          methodology: "Precedent Txns",
          low: parseFloat(Math.min(lo, hi).toFixed(2)),
          high: parseFloat(Math.max(lo, hi).toFixed(2)),
          midLabel: fmtShare((lo + hi) / 2),
          color: "hsl(32, 95%, 53%)",  // amber
        });
      }
    }

    if (curPrice > 0) {
      // 52-week-ish implied range around current price ±20%
      list.push({
        methodology: "52-Wk Range (est.)",
        low: parseFloat((curPrice * 0.80).toFixed(2)),
        high: parseFloat((curPrice * 1.20).toFixed(2)),
        midLabel: fmtShare(curPrice),
        color: "hsl(0, 0%, 55%)",  // grey
      });
    }

    return list;
  }, [dcfBear, dcfBull, lboBear, lboBull, lboBearPrice, lboBullPrice, compsLowEV, compsHighEV, precLowEV, precHighEV, curPrice, nd, shares]);

  // ── Verdict ────────────────────────────────────────────────────────────────

  const dcfMid = dcfBear && dcfBull
    ? (dcfBear.impliedSharePrice + dcfBull.impliedSharePrice) / 2
    : NaN;
  const lboMid = isFinite(lboBearPrice) && isFinite(lboBullPrice)
    ? (lboBearPrice + lboBullPrice) / 2
    : NaN;

  const overallMid = [dcfMid, lboMid].filter(isFinite);
  const consensusMid = overallMid.length > 0 ? overallMid.reduce((a, b) => a + b, 0) / overallMid.length : NaN;
  const consensusUpside = curPrice > 0 && isFinite(consensusMid) ? ((consensusMid - curPrice) / curPrice) * 100 : NaN;

  const verdictText = () => {
    if (!isFinite(consensusUpside)) return "Enter inputs to generate verdict";
    if (consensusUpside >= 30) return `Strong Buy — Consensus mid-point implies ${fmtPct(consensusUpside)} upside`;
    if (consensusUpside >= 10) return `Buy — Consensus mid-point implies ${fmtPct(consensusUpside)} upside`;
    if (consensusUpside >= -10) return `Fairly Valued — ${fmtPct(Math.abs(consensusUpside))} ${consensusUpside >= 0 ? "upside" : "downside"}`;
    return `Overvalued — Consensus implies ${fmtPct(Math.abs(consensusUpside))} downside`;
  };

  const verdictColor = () => {
    if (!isFinite(consensusUpside)) return "bg-muted text-muted-foreground";
    if (consensusUpside >= 30) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700";
    if (consensusUpside >= 10) return "bg-primary/10 text-primary border-primary/20";
    if (consensusUpside >= -10) return "bg-amber-400/15 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700";
    return "bg-red-400/15 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700";
  };

  // ── IRR verdict ────────────────────────────────────────────────────────────
  const lboMidIRR = lboBear && lboBull ? (lboBear.irr + lboBull.irr) / 2 : NaN;
  const lboMidMOIC = lboBear && lboBull ? (lboBear.moic + lboBull.moic) / 2 : NaN;
  const irrColor = () => {
    if (!isFinite(lboMidIRR)) return "text-muted-foreground";
    if (lboMidIRR >= 25) return "text-emerald-600 dark:text-emerald-400";
    if (lboMidIRR >= 18) return "text-primary";
    if (lboMidIRR >= 12) return "text-amber-600 dark:text-amber-400";
    return "text-red-500 dark:text-red-400";
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers size={18} className="text-primary" />
              <h1 className="text-xl font-bold tracking-tight">Valuation Football Field</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              DCF implied share price vs. LBO IRR/MOIC — side by side.{" "}
              <span className="text-[11px] italic opacity-70">est. — all figures simplified</span>
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link href="/dcf">
              <a className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                <BarChart2 size={12} />DCF
              </a>
            </Link>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <Link href="/lbo">
              <a className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                <Calculator size={12} />LBO
              </a>
            </Link>
          </div>
        </div>

        {/* Prefill banner */}
        {prefillParams?.companyName && (
          <div className="mb-5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2.5">
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              Pre-populated from <span className="font-semibold">{prefillParams.companyName}</span> — adjust share price, net debt, and LBO assumptions to complete the football field.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

          {/* ── Left: Inputs ── */}
          <div className="xl:col-span-2 space-y-4">

            {/* Company */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Company</p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Company Name</Label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Target Co." data-testid="ff-company" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">LTM Revenue ($M)</Label>
                    <Input value={revenue} onChange={e => setRevenue(e.target.value)} placeholder="500" data-testid="ff-revenue" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">LTM EBITDA ($M)</Label>
                    <Input value={ebitdaRaw} onChange={e => setEbitdaRaw(e.target.value)} placeholder="110" data-testid="ff-ebitda" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Current Price ($)</Label>
                    <Input value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} placeholder="45.00" data-testid="ff-price" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Shares Out. (M)</Label>
                    <Input value={sharesOut} onChange={e => setSharesOut(e.target.value)} placeholder="100" data-testid="ff-shares" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Net Debt ($M)</Label>
                    <Input value={netDebt} onChange={e => setNetDebt(e.target.value)} placeholder="200" data-testid="ff-netdebt" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Tax Rate (%)</Label>
                    <Input value={taxRate} onChange={e => setTaxRate(e.target.value)} placeholder="25" data-testid="ff-taxrate" />
                  </div>
                </div>
              </div>
            </div>

            {/* DCF Assumptions */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                DCF Assumptions
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Revenue Growth (%/yr)</Label>
                  <Input value={revenueGrowth} onChange={e => setRevenueGrowth(e.target.value)} placeholder="15" data-testid="ff-dcf-growth" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">WACC Low (%)</Label>
                    <Input value={dcfWaccLow} onChange={e => setDcfWaccLow(e.target.value)} placeholder="9" data-testid="ff-wacc-low" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">WACC High (%)</Label>
                    <Input value={dcfWaccHigh} onChange={e => setDcfWaccHigh(e.target.value)} placeholder="11" data-testid="ff-wacc-high" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">TV Mult Low (x)</Label>
                    <Input value={terminalMultLow} onChange={e => setTerminalMultLow(e.target.value)} placeholder="10" data-testid="ff-tv-low" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">TV Mult High (x)</Label>
                    <Input value={terminalMultHigh} onChange={e => setTerminalMultHigh(e.target.value)} placeholder="14" data-testid="ff-tv-high" />
                  </div>
                </div>

                {/* Advanced toggle */}
                <button
                  onClick={() => setShowAdv(!showAdv)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
                >
                  {showAdv ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  Advanced (D&A · Capex · NWC)
                </button>
                {showAdv && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <Label className="text-xs mb-1.5 block">D&A (% rev)</Label>
                      <Input value={daPercent} onChange={e => setDaPercent(e.target.value)} placeholder="4" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Capex (% rev)</Label>
                      <Input value={capexPercent} onChange={e => setCapexPercent(e.target.value)} placeholder="5" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">ΔNWC (%)</Label>
                      <Input value={nwcPercent} onChange={e => setNwcPercent(e.target.value)} placeholder="5" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* LBO Assumptions */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />
                LBO Assumptions
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Entry EV/EBITDA</Label>
                    <Input value={entryMult} onChange={e => setEntryMult(e.target.value)} placeholder="10" data-testid="ff-lbo-entry" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Debt / EBITDA</Label>
                    <Input value={debtMult} onChange={e => setDebtMult(e.target.value)} placeholder="5" data-testid="ff-lbo-debt" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Interest Rate (%)</Label>
                    <Input value={interestRate} onChange={e => setInterestRate(e.target.value)} placeholder="7.5" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">EBITDA Growth (%)</Label>
                    <Input value={ebitdaGrowth} onChange={e => setEbitdaGrowth(e.target.value)} placeholder="8" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Exit Mult Low (x)</Label>
                    <Input value={exitMultLow} onChange={e => setExitMultLow(e.target.value)} placeholder="9" data-testid="ff-exit-low" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Exit Mult High (x)</Label>
                    <Input value={exitMultHigh} onChange={e => setExitMultHigh(e.target.value)} placeholder="12" data-testid="ff-exit-high" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-2 block">Hold Period: <span className="font-semibold text-foreground">{holdYears} years</span></Label>
                  <Slider
                    min={3} max={7} step={1}
                    value={[holdYears]}
                    onValueChange={([v]) => setHoldYears(v)}
                    data-testid="ff-hold-period"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>3yr</span><span>5yr</span><span>7yr</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Comps / Precedents (optional) */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Comps / Precedents
                <span className="text-[10px] normal-case font-normal ml-1 italic">(optional — EV in $M)</span>
              </p>
              <p className="text-[10px] text-muted-foreground mb-3">Pull from the Comps or Precedents pages and enter the EV range here.</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block text-emerald-600 dark:text-emerald-400">Trading Comps EV Low</Label>
                    <Input value={compsEvLow} onChange={e => setCompsEvLow(e.target.value)} placeholder="1800" data-testid="ff-comps-low" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block text-emerald-600 dark:text-emerald-400">Trading Comps EV High</Label>
                    <Input value={compsEvHigh} onChange={e => setCompsEvHigh(e.target.value)} placeholder="2400" data-testid="ff-comps-high" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block text-amber-600 dark:text-amber-400">Precedent Txns EV Low</Label>
                    <Input value={precEvLow} onChange={e => setPrecEvLow(e.target.value)} placeholder="2000" data-testid="ff-prec-low" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block text-amber-600 dark:text-amber-400">Precedent Txns EV High</Label>
                    <Input value={precEvHigh} onChange={e => setPrecEvHigh(e.target.value)} placeholder="2800" data-testid="ff-prec-high" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Link href="/comps">
                    <a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                      <ArrowRight size={11} />Go to Comps
                    </a>
                  </Link>
                  <span className="text-muted-foreground/40">·</span>
                  <Link href="/precedents">
                    <a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                      <ArrowRight size={11} />Go to Precedents
                    </a>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: Output ── */}
          <div className="xl:col-span-3 space-y-5">

            {/* Summary headline */}
            <div className={`rounded-xl border p-4 ${verdictColor()}`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">
                {companyName} — Valuation Verdict (est.)
              </p>
              <p className="text-sm font-semibold">{verdictText()}</p>
              {isFinite(consensusMid) && (
                <p className="text-2xl font-bold mono mt-1">{fmtShare(consensusMid)} <span className="text-sm font-normal opacity-70">consensus mid (est.)</span></p>
              )}
            </div>

            {/* Key metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard
                label="DCF Implied (est.)"
                value={isFinite(dcfMid) ? fmtShare(dcfMid) : "—"}
                sub={isFinite(dcfMid) && curPrice > 0 ? `${fmtPct(((dcfMid - curPrice) / curPrice) * 100)} vs current` : undefined}
                accent="text-blue-600 dark:text-blue-400"
              />
              <SummaryCard
                label="LBO Implied (est.)"
                value={isFinite(lboMid) ? fmtShare(lboMid) : "—"}
                sub={isFinite(lboMid) && curPrice > 0 ? `${fmtPct(((lboMid - curPrice) / curPrice) * 100)} vs current` : undefined}
                accent="text-violet-600 dark:text-violet-400"
              />
              <SummaryCard
                label="LBO IRR (est.)"
                value={isFinite(lboMidIRR) ? fmtPct(lboMidIRR) : "—"}
                sub={isFinite(lboMidIRR) ? (lboMidIRR >= 20 ? "PE-grade return" : lboMidIRR >= 15 ? "Threshold IRR" : "Below hurdle") : undefined}
                accent={irrColor()}
              />
              <SummaryCard
                label="LBO MOIC (est.)"
                value={isFinite(lboMidMOIC) ? fmtMult(lboMidMOIC) : "—"}
                sub={isFinite(lboMidMOIC) ? `${holdYears}-year hold` : undefined}
                accent="text-violet-600 dark:text-violet-400"
              />
            </div>

            {/* Football field chart */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Implied Share Price Range <span className="normal-case font-normal italic">(est.)</span>
              </p>
              <p className="text-[11px] text-muted-foreground mb-4">
                Horizontal bars show bear → bull range per methodology. Dashed line = current price.
              </p>
              {bands.length >= 2 ? (
                <FootballFieldChart bands={bands} currentPrice={curPrice} />
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  Enter company inputs and at least one methodology to see the chart.
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                {bands.map(b => (
                  <div key={b.methodology} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: b.color, opacity: 0.85 }} />
                    <span className="text-[11px] text-muted-foreground">{b.methodology}</span>
                    <span className="text-[11px] font-mono font-semibold">{fmtShare(b.low)}–{fmtShare(b.high)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Side-by-side DCF vs LBO detail */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* DCF detail */}
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">DCF Detail (est.)</p>
                </div>
                <div className="space-y-2 text-xs">
                  {[
                    { label: "Bear case", val: dcfBear ? fmtShare(dcfBear.impliedSharePrice) : "—", sub: `WACC ${dcfWaccHigh}%, TV ${terminalMultLow}x` },
                    { label: "Bull case", val: dcfBull ? fmtShare(dcfBull.impliedSharePrice) : "—", sub: `WACC ${dcfWaccLow}%, TV ${terminalMultHigh}x` },
                    { label: "EV range", val: dcfBear && dcfBull ? `${fmtM(Math.min(dcfBear.enterpriseValue, dcfBull.enterpriseValue))}–${fmtM(Math.max(dcfBear.enterpriseValue, dcfBull.enterpriseValue))}` : "—", sub: "Enterprise Value" },
                  ].map(({ label, val, sub }) => (
                    <div key={label} className="flex items-center justify-between py-1 border-b last:border-0">
                      <div>
                        <p className="font-medium text-foreground">{label}</p>
                        <p className="text-muted-foreground text-[10px]">{sub}</p>
                      </div>
                      <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{val}</span>
                    </div>
                  ))}
                </div>
                <Link href="/dcf">
                  <a className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowRight size={11} />Full DCF model
                  </a>
                </Link>
              </div>

              {/* LBO detail */}
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-500 flex-shrink-0" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">LBO Detail (est.)</p>
                </div>
                <div className="space-y-2 text-xs">
                  {[
                    {
                      label: "Bear IRR / MOIC",
                      val: lboBear ? `${fmtPct(lboBear.irr)} / ${fmtMult(lboBear.moic)}` : "—",
                      sub: `Exit ${exitMultLow}x, ${holdYears}-yr`,
                    },
                    {
                      label: "Bull IRR / MOIC",
                      val: lboBull ? `${fmtPct(lboBull.irr)} / ${fmtMult(lboBull.moic)}` : "—",
                      sub: `Exit ${exitMultHigh}x, ${holdYears}-yr`,
                    },
                    {
                      label: "Entry EV",
                      val: ebt > 0 ? fmtM(ebt * (parseFloat(entryMult) || 10)) : "—",
                      sub: `${entryMult}x entry · ${debtMult}x debt`,
                    },
                  ].map(({ label, val, sub }) => (
                    <div key={label} className="flex items-center justify-between py-1 border-b last:border-0">
                      <div>
                        <p className="font-medium text-foreground">{label}</p>
                        <p className="text-muted-foreground text-[10px]">{sub}</p>
                      </div>
                      <span className="font-mono font-semibold text-violet-600 dark:text-violet-400">{val}</span>
                    </div>
                  ))}
                </div>
                <Link href="/lbo">
                  <a className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowRight size={11} />Full LBO model
                  </a>
                </Link>
              </div>
            </div>

            {/* Methodology note */}
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-start gap-2">
                <Info size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p className="font-medium text-foreground">Football Field Methodology <span className="font-normal italic">(est.)</span></p>
                  <p>DCF bear = high WACC + low TV multiple. DCF bull = low WACC + high TV multiple. LBO bear/bull = low/high exit multiple at same hold period.</p>
                  <p>LBO implied share price derived from exit equity proceeds minus net debt, divided by diluted shares outstanding.</p>
                  <p>Comps and precedents require manual EV entry from the Comps and Precedents pages. 52-week range is ±20% of current price <span className="italic">(est.)</span>.</p>
                  <p className="italic">Not investment advice. Simplified model for illustrative use only.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
