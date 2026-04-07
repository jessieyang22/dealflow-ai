import { useState, useMemo, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import {
  TrendingUp, TrendingDown, BarChart2, Info,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown, Layers,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const FORECAST_YEARS = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtM(n: number) {
  if (!isFinite(n) || isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}T`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}B`;
  return `$${n.toFixed(0)}M`;
}

function fmtShare(n: number) {
  if (!isFinite(n) || isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function pct(n: number, dec = 1) {
  if (!isFinite(n) || isNaN(n)) return "—";
  return `${n.toFixed(dec)}%`;
}

function mult(n: number) {
  if (!isFinite(n) || isNaN(n)) return "—";
  return `${n.toFixed(1)}x`;
}

/**
 * Core DCF engine.
 * Returns: { impliedSharePrice, enterpriseValue, equityValue, pvFCFs, pvTerminal, terminalValue, fcfRows }
 */
function runDCF(inputs: {
  revenue: number;
  revenueGrowthRates: number[];   // length = FORECAST_YEARS, decimal
  ebitdaMargins: number[];         // length = FORECAST_YEARS, decimal
  daPercent: number;               // D&A as % revenue, decimal
  capexPercent: number;            // Capex as % revenue, decimal
  nwcChangePercent: number;        // ΔWorking capital as % revenue change, decimal
  taxRate: number;                 // decimal
  wacc: number;                    // decimal
  terminalGrowthRate: number;      // decimal (Gordon Growth)
  terminalEBITDAMult: number;      // exit multiple on EBITDA
  netDebt: number;                 // $M, debt - cash
  sharesOut: number;               // M shares
  useExitMultiple: boolean;        // true = exit mult, false = Gordon Growth
}) {
  const {
    revenue, revenueGrowthRates, ebitdaMargins, daPercent, capexPercent,
    nwcChangePercent, taxRate, wacc, terminalGrowthRate, terminalEBITDAMult,
    netDebt, sharesOut, useExitMultiple,
  } = inputs;

  if (wacc <= 0 || revenue <= 0 || sharesOut <= 0) return null;

  const rows: Array<{
    year: number; revenue: number; ebitda: number; ebit: number;
    nopat: number; da: number; capex: number; nwcChange: number; fcf: number;
    pvFactor: number; pvFCF: number;
  }> = [];

  let prevRevenue = revenue;
  let totalPVFCF = 0;

  for (let y = 1; y <= FORECAST_YEARS; y++) {
    const rev = prevRevenue * (1 + revenueGrowthRates[y - 1]);
    const ebitda = rev * ebitdaMargins[y - 1];
    const da = rev * daPercent;
    const ebit = ebitda - da;
    const nopat = ebit * (1 - taxRate);
    const capex = rev * capexPercent;
    const nwcChange = (rev - prevRevenue) * nwcChangePercent;
    const fcf = nopat + da - capex - nwcChange;
    const pvFactor = 1 / Math.pow(1 + wacc, y);
    const pvFCF = fcf * pvFactor;
    totalPVFCF += pvFCF;
    rows.push({ year: y, revenue: rev, ebitda, ebit, nopat, da, capex, nwcChange, fcf, pvFactor, pvFCF });
    prevRevenue = rev;
  }

  // Terminal year EBITDA / FCF
  const terminalEBITDA = rows[FORECAST_YEARS - 1].ebitda;
  const terminalFCF = rows[FORECAST_YEARS - 1].fcf;
  const discountFactorTerminal = 1 / Math.pow(1 + wacc, FORECAST_YEARS);

  let terminalValue: number;
  if (useExitMultiple) {
    terminalValue = terminalEBITDA * terminalEBITDAMult;
  } else {
    // Gordon Growth: FCF × (1+g) / (WACC - g)
    if (wacc <= terminalGrowthRate) return null;
    terminalValue = (terminalFCF * (1 + terminalGrowthRate)) / (wacc - terminalGrowthRate);
  }

  const pvTerminal = terminalValue * discountFactorTerminal;
  const enterpriseValue = totalPVFCF + pvTerminal;
  const equityValue = enterpriseValue - netDebt;
  const impliedSharePrice = sharesOut > 0 ? equityValue / sharesOut : NaN;
  const pvFCFPct = (totalPVFCF / enterpriseValue) * 100;
  const pvTerminalPct = (pvTerminal / enterpriseValue) * 100;

  return {
    impliedSharePrice, enterpriseValue, equityValue,
    pvFCFs: totalPVFCF, pvTerminal, pvFCFPct, pvTerminalPct,
    terminalValue, rows,
  };
}

// ── Sensitivity builder ───────────────────────────────────────────────────────

function buildSensitivity(
  baseInputs: Parameters<typeof runDCF>[0],
  waccRange: number[],
  multRange: number[],
) {
  return waccRange.map(w =>
    multRange.map(m => {
      const r = runDCF({ ...baseInputs, wacc: w / 100, terminalEBITDAMult: m });
      return r?.impliedSharePrice ?? NaN;
    })
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DCFCalculator() {
  // Parse URL prefill params (set by M&A Analyzer "Run DCF" button)
  const prefillParams = useMemo(() => {
    const hash = window.location.hash || "";
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return null;
    const p = new URLSearchParams(hash.slice(qIdx + 1));
    if (p.get("prefill") !== "1") return null;
    return {
      revenue: p.get("revenue") || "",
      ebitdaMargin: p.get("ebitdaMargin") || "",
      companyName: p.get("name") || "",
    };
  }, []);

  // Company inputs
  const [revenue, setRevenue] = useState(prefillParams?.revenue || "500");
  const [currentPrice, setCurrentPrice] = useState("45.00");
  const [sharesOut, setSharesOut] = useState("100");
  const [netDebt, setNetDebt] = useState("200");
  const [taxRate, setTaxRate] = useState("25");

  // Prefill banner
  const [prefillBanner, setPrefillBanner] = useState(!!prefillParams?.companyName);

  // Sync if params arrive after first render
  useEffect(() => {
    if (prefillParams?.revenue) setRevenue(prefillParams.revenue);
    if (prefillParams?.ebitdaMargin) setEbitdaMargin(prefillParams.ebitdaMargin);
  }, []);

  // Forecast assumptions
  const [revenueGrowth, setRevenueGrowth] = useState("15"); // single rate (can expand)
  const [ebitdaMargin, setEbitdaMargin] = useState(prefillParams?.ebitdaMargin || "22");
  const [daPercent, setDaPercent] = useState("4");
  const [capexPercent, setCapexPercent] = useState("5");
  const [nwcPercent, setNwcPercent] = useState("5");

  // Discount / terminal
  const [wacc, setWacc] = useState("10");
  const [terminalGrowth, setTerminalGrowth] = useState("2.5");
  const [terminalMult, setTerminalMult] = useState("12");
  const [tvMethod, setTvMethod] = useState<"mult" | "gg">("mult");

  // Advanced toggle
  const [showAdv, setShowAdv] = useState(false);

  // ── Derived inputs ────────────────────────────────────────────────────────────

  const inputs = useMemo<Parameters<typeof runDCF>[0]>(() => {
    const gr = (parseFloat(revenueGrowth) || 0) / 100;
    return {
      revenue: parseFloat(revenue) || 0,
      revenueGrowthRates: Array(FORECAST_YEARS).fill(gr),
      ebitdaMargins: Array(FORECAST_YEARS).fill((parseFloat(ebitdaMargin) || 0) / 100),
      daPercent: (parseFloat(daPercent) || 0) / 100,
      capexPercent: (parseFloat(capexPercent) || 0) / 100,
      nwcChangePercent: (parseFloat(nwcPercent) || 0) / 100,
      taxRate: (parseFloat(taxRate) || 0) / 100,
      wacc: (parseFloat(wacc) || 0) / 100,
      terminalGrowthRate: (parseFloat(terminalGrowth) || 0) / 100,
      terminalEBITDAMult: parseFloat(terminalMult) || 0,
      netDebt: parseFloat(netDebt) || 0,
      sharesOut: parseFloat(sharesOut) || 0,
      useExitMultiple: tvMethod === "mult",
    };
  }, [revenue, revenueGrowth, ebitdaMargin, daPercent, capexPercent,
      nwcPercent, taxRate, wacc, terminalGrowth, terminalMult, netDebt,
      sharesOut, tvMethod]);

  const result = useMemo(() => runDCF(inputs), [inputs]);

  // Sensitivity ranges
  const waccRange  = [8, 9, 10, 11, 12];  // rows
  const multRange  = [8, 10, 12, 14, 16]; // cols
  const sensitivity = useMemo(
    () => buildSensitivity(inputs, waccRange, multRange),
    [inputs]
  );

  const curPrice = parseFloat(currentPrice) || 0;

  // Color helpers
  const upside = result ? ((result.impliedSharePrice - curPrice) / curPrice) * 100 : 0;

  function cellStyle(price: number) {
    if (!isFinite(price) || isNaN(price) || curPrice === 0) return "bg-muted/30 text-muted-foreground";
    const up = ((price - curPrice) / curPrice) * 100;
    if (up >= 30) return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400";
    if (up >= 10) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500";
    if (up >= -10) return "bg-amber-400/15 text-amber-700 dark:text-amber-400";
    return "bg-red-400/15 text-red-700 dark:text-red-400";
  }

  const verdictBadge = () => {
    if (!result) return null;
    if (upside >= 30) return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/15"><TrendingUp size={11} className="mr-1" />Strong Buy (+{upside.toFixed(0)}% upside)</Badge>;
    if (upside >= 10) return <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10"><TrendingUp size={11} className="mr-1" />Buy (+{upside.toFixed(0)}% upside)</Badge>;
    if (upside >= -10) return <Badge className="bg-amber-400/15 text-amber-600 border-amber-400/20 hover:bg-amber-400/15">Fairly Valued ({upside >= 0 ? "+" : ""}{upside.toFixed(0)}%)</Badge>;
    return <Badge className="bg-red-400/15 text-red-600 border-red-400/20 hover:bg-red-400/15"><TrendingDown size={11} className="mr-1" />Overvalued ({upside.toFixed(0)}%)</Badge>;
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 size={18} className="text-primary" />
            <h1 className="text-xl font-bold tracking-tight">DCF Valuation Model</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            5-year explicit FCF forecast → terminal value → implied share price.{" "}
            <span className="text-[11px] italic opacity-70">est. — simplified model, for illustrative purposes only</span>
          </p>
        </div>

        {/* Prefill banner */}
        {prefillBanner && prefillParams?.companyName && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <ArrowDown size={13} className="text-blue-500 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Pre-populated from <span className="font-semibold">{prefillParams.companyName}</span> analysis — LTM Revenue and EBITDA Margin carried over. Adjust remaining inputs.
              </p>
            </div>
            <button onClick={() => setPrefillBanner(false)} className="text-blue-400 hover:text-blue-600 flex-shrink-0 text-xs">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Left: Inputs ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Company */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Company Inputs</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">LTM Revenue ($M)</Label>
                    <Input value={revenue} onChange={e => setRevenue(e.target.value)} placeholder="500" data-testid="dcf-revenue" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Current Price ($)</Label>
                    <Input value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} placeholder="45.00" data-testid="dcf-price" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Shares Out. (M)</Label>
                    <Input value={sharesOut} onChange={e => setSharesOut(e.target.value)} placeholder="100" data-testid="dcf-shares" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Net Debt ($M)</Label>
                    <Input value={netDebt} onChange={e => setNetDebt(e.target.value)} placeholder="200" data-testid="dcf-net-debt" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Tax Rate (%)</Label>
                  <Input value={taxRate} onChange={e => setTaxRate(e.target.value)} placeholder="25" data-testid="dcf-tax-rate" />
                </div>
              </div>
            </div>

            {/* Forecast */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Forecast Assumptions</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Revenue Growth (%/yr)</Label>
                    <Input value={revenueGrowth} onChange={e => setRevenueGrowth(e.target.value)} placeholder="15" data-testid="dcf-rev-growth" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">EBITDA Margin (%)</Label>
                    <Input value={ebitdaMargin} onChange={e => setEbitdaMargin(e.target.value)} placeholder="22" data-testid="dcf-margin" />
                  </div>
                </div>
                {/* Advanced toggle */}
                <button
                  className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors pt-1"
                  onClick={() => setShowAdv(!showAdv)}
                >
                  <span>Advanced (D&A · Capex · NWC)</span>
                  {showAdv ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {showAdv && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs mb-1.5 block">D&A (% rev)</Label>
                        <Input value={daPercent} onChange={e => setDaPercent(e.target.value)} placeholder="4" data-testid="dcf-da" />
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5 block">Capex (% rev)</Label>
                        <Input value={capexPercent} onChange={e => setCapexPercent(e.target.value)} placeholder="5" data-testid="dcf-capex" />
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5 block">ΔNWC (% Δrev)</Label>
                        <Input value={nwcPercent} onChange={e => setNwcPercent(e.target.value)} placeholder="5" data-testid="dcf-nwc" />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">
                      FCF = NOPAT + D&A − Capex − ΔNWC. NOPAT = EBIT × (1 − tax rate).
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* WACC + Terminal */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Discount & Terminal Value</p>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <Label className="text-xs">WACC</Label>
                    <span className="text-xs font-semibold text-primary">{wacc}%</span>
                  </div>
                  <Slider
                    value={[parseFloat(wacc) || 10]}
                    min={5} max={20} step={0.5}
                    onValueChange={([v]) => setWacc(v.toString())}
                    data-testid="dcf-wacc-slider"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>5%</span><span>10%</span><span>20%</span>
                  </div>
                </div>

                {/* TV Method Tabs */}
                <div>
                  <Label className="text-xs mb-2 block">Terminal Value Method</Label>
                  <Tabs value={tvMethod} onValueChange={v => setTvMethod(v as "mult" | "gg")}>
                    <TabsList className="w-full h-8 text-xs">
                      <TabsTrigger value="mult" className="flex-1 text-xs" data-testid="dcf-tv-mult">Exit Multiple</TabsTrigger>
                      <TabsTrigger value="gg" className="flex-1 text-xs" data-testid="dcf-tv-gg">Gordon Growth</TabsTrigger>
                    </TabsList>
                    <TabsContent value="mult" className="mt-3">
                      <Label className="text-xs mb-1.5 block">Terminal EV/EBITDA</Label>
                      <Input value={terminalMult} onChange={e => setTerminalMult(e.target.value)} placeholder="12" data-testid="dcf-terminal-mult" />
                    </TabsContent>
                    <TabsContent value="gg" className="mt-3">
                      <Label className="text-xs mb-1.5 block">Terminal Growth Rate (%)</Label>
                      <Input value={terminalGrowth} onChange={e => setTerminalGrowth(e.target.value)} placeholder="2.5" data-testid="dcf-terminal-growth" />
                      <p className="text-[10px] text-muted-foreground mt-1">TV = FCF₅ × (1+g) / (WACC − g)</p>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: Outputs ── */}
          <div className="lg:col-span-3 space-y-4">

            {result ? (
              <>
                {/* Implied Share Price */}
                <div className="rounded-xl border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Intrinsic Value</p>
                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <div className="rounded-lg bg-muted/40 p-4 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Implied Price <span className="normal-case italic">(est.)</span></p>
                      <p className="text-3xl font-bold font-mono text-primary">{fmtShare(result.impliedSharePrice)}</p>
                      {curPrice > 0 && (
                        <p className={`text-xs font-semibold mt-0.5 flex items-center justify-center gap-0.5 ${upside >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {upside >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                          {Math.abs(upside).toFixed(1)}% vs ${curPrice.toFixed(2)}
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg bg-muted/40 p-4 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Equity Value <span className="normal-case italic">(est.)</span></p>
                      <p className="text-3xl font-bold font-mono">{fmtM(result.equityValue)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">EV: {fmtM(result.enterpriseValue)}</p>
                    </div>
                  </div>

                  {verdictBadge() && <div className="flex justify-center mb-4">{verdictBadge()}</div>}

                  <Separator className="mb-4" />

                  {/* PV breakdown */}
                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div>
                      <p className="text-muted-foreground mb-0.5">PV FCFs <span className="italic">(est.)</span></p>
                      <p className="font-semibold font-mono">{fmtM(result.pvFCFs)}</p>
                      <p className="text-[10px] text-muted-foreground">{pct(result.pvFCFPct)} of EV</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">PV Terminal <span className="italic">(est.)</span></p>
                      <p className="font-semibold font-mono">{fmtM(result.pvTerminal)}</p>
                      <p className="text-[10px] text-muted-foreground">{pct(result.pvTerminalPct)} of EV</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Terminal Value <span className="italic">(est.)</span></p>
                      <p className="font-semibold font-mono">{fmtM(result.terminalValue)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {tvMethod === "mult" ? `${terminalMult}x EV/EBITDA` : `${terminalGrowth}% growth`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sensitivity: WACC × Terminal Multiple */}
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Share Price Sensitivity</p>
                      <p className="text-[10px] text-muted-foreground italic mt-0.5">
                        WACC (rows) × terminal EV/EBITDA (cols) — est.
                        {curPrice > 0 && <span className="ml-1">· Color vs current price ${curPrice.toFixed(2)}</span>}
                      </p>
                    </div>
                    {curPrice > 0 && (
                      <div className="flex items-center gap-2 text-[10px] flex-shrink-0">
                        <span className="w-3 h-3 rounded bg-emerald-500/20 inline-block" />+30%
                        <span className="w-3 h-3 rounded bg-emerald-500/10 inline-block" />+10%
                        <span className="w-3 h-3 rounded bg-amber-400/15 inline-block" />Fair
                        <span className="w-3 h-3 rounded bg-red-400/15 inline-block" />OV
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr>
                          <th className="text-left text-muted-foreground font-medium pb-2 pr-4">WACC\TV Mult</th>
                          {multRange.map(m => (
                            <th key={m} className={`text-center pb-2 px-1 ${m === parseFloat(terminalMult) ? "text-primary font-bold" : "text-muted-foreground font-medium"}`}>
                              {m}x
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sensitivity.map((row, ri) => (
                          <tr key={ri}>
                            <td className={`pr-4 py-1 font-medium ${waccRange[ri] === parseFloat(wacc) ? "text-primary font-bold" : "text-muted-foreground"}`}>
                              {waccRange[ri]}%
                            </td>
                            {row.map((price, ci) => (
                              <td key={ci} className="px-1 py-0.5">
                                <div className={`text-center rounded px-2 py-1 text-[11px] font-semibold ${cellStyle(price)}`}>
                                  {isNaN(price) ? "—" : fmtShare(price)}
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* FCF Schedule */}
                <div className="rounded-xl border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                    FCF Forecast Schedule <span className="normal-case font-normal italic">(est. — simplified)</span>
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="text-left pb-2 font-medium">Year</th>
                          <th className="text-right pb-2 font-medium">Revenue</th>
                          <th className="text-right pb-2 font-medium">EBITDA</th>
                          <th className="text-right pb-2 font-medium">EBIT</th>
                          <th className="text-right pb-2 font-medium">uFCF <span className="italic">(est.)</span></th>
                          <th className="text-right pb-2 font-medium">PV <span className="italic">(est.)</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.rows.map(r => (
                          <tr key={r.year} className="font-mono">
                            <td className="py-1.5 text-muted-foreground">Y{r.year}</td>
                            <td className="py-1.5 text-right">{fmtM(r.revenue)}</td>
                            <td className="py-1.5 text-right">{fmtM(r.ebitda)}</td>
                            <td className="py-1.5 text-right">{fmtM(r.ebit)}</td>
                            <td className={`py-1.5 text-right font-semibold ${r.fcf >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                              {r.fcf >= 0 ? fmtM(r.fcf) : `(${fmtM(Math.abs(r.fcf))})`}
                            </td>
                            <td className="py-1.5 text-right text-primary">{fmtM(r.pvFCF)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t">
                        <tr className="font-mono font-semibold text-muted-foreground">
                          <td colSpan={5} className="pt-2 text-xs">Terminal Value (est.)</td>
                          <td className="pt-2 text-right text-primary">{fmtM(result.pvTerminal)}</td>
                        </tr>
                        <tr className="font-mono font-semibold">
                          <td colSpan={5} className="pt-1 text-xs">Enterprise Value (est.)</td>
                          <td className="pt-1 text-right text-primary font-bold">{fmtM(result.enterpriseValue)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-3 italic">
                    uFCF = unlevered free cash flow = NOPAT + D&A − Capex − ΔNWC. All figures estimated.
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-xl border bg-card p-10 flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
                <BarChart2 size={28} className="opacity-30" />
                <p className="text-sm">Check inputs — ensure WACC &gt; terminal growth rate</p>
              </div>
            )}

            {/* Methodology note */}
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-start gap-2">
                <Info size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p className="font-medium text-foreground">Methodology <span className="font-normal italic">(est. — simplified)</span></p>
                  <p>WACC = blended cost of debt + equity (enter manually). uFCF discounted over {FORECAST_YEARS}-year period.</p>
                  <p>Terminal value: Exit Multiple (EV = terminal EBITDA × mult) or Gordon Growth Model (EV = FCF₅ × (1+g) / (WACC−g)).</p>
                  <p>Equity Value = Enterprise Value − Net Debt. Implied Price = Equity Value ÷ Shares Outstanding.</p>
                  <p className="italic">Not investment advice. For educational and illustrative use only.</p>
                </div>
              </div>
            </div>

            {/* Football Field CTA */}
            {result && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/15 p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Ready to run the full Football Field?</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Combine DCF implied price with LBO IRR/MOIC on a single valuation chart.</p>
                </div>
                <Link href={`/football-field?prefill=1&revenue=${revenue}&ebitda=${ebitdaMargin}&name=${encodeURIComponent(prefillParams?.companyName || "")}` }>
                  <a className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap hover:underline">
                    <Layers size={13} />Football Field →
                  </a>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
