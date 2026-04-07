import { useState, useMemo, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp, TrendingDown, Calculator, Info,
  ChevronDown, ChevronUp, DollarSign, Percent,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 1) {
  if (!isFinite(n) || isNaN(n)) return "—";
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}B`;
  return `$${n.toFixed(decimals)}M`;
}

function pct(n: number) {
  if (!isFinite(n) || isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function moic(n: number) {
  if (!isFinite(n) || isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

/** Compute IRR via Newton's method on a simple 2-CF stream: -initial, +final at year n */
function calcIRR(initial: number, final: number, years: number): number {
  if (initial <= 0 || final <= 0 || years <= 0) return NaN;
  return (Math.pow(final / initial, 1 / years) - 1) * 100;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function LBOCalculator() {
  // Parse URL prefill params (from M&A Analyzer "Run LBO" button)
  const prefillParams = useMemo(() => {
    const hash = window.location.hash || "";
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return null;
    const p = new URLSearchParams(hash.slice(qIdx + 1));
    if (p.get("prefill") !== "1") return null;
    return {
      ebitda: p.get("ebitda") || "",
      companyName: p.get("name") || "",
    };
  }, []);

  const [prefillBanner, setPrefillBanner] = useState(!!prefillParams?.companyName);

  // Entry
  const [ebitda, setEbitda] = useState(prefillParams?.ebitda || "100");
  const [entryMultiple, setEntryMultiple] = useState("10");
  const [debtMultiple, setDebtMultiple] = useState("5");
  const [interestRate, setInterestRate] = useState("7.5");
  const [mgmtFees, setMgmtFees] = useState("2");

  // Operations
  const [ebitdaGrowth, setEbitdaGrowth] = useState("8");
  const [revenueGrowth, setRevenueGrowth] = useState("12");
  const [holdPeriod, setHoldPeriod] = useState(5);

  // Exit
  const [exitMultiple, setExitMultiple] = useState("11");

  // Amortization toggle
  const [showAmort, setShowAmort] = useState(false);
  const [debtPaydown, setDebtPaydown] = useState("20"); // % of FCF to debt paydown per year

  // ── Calculations ─────────────────────────────────────────────────────────────

  const calc = useMemo(() => {
    const eb = parseFloat(ebitda) || 0;
    const entMult = parseFloat(entryMultiple) || 0;
    const debtMult = parseFloat(debtMultiple) || 0;
    const intRate = (parseFloat(interestRate) || 0) / 100;
    const fees = (parseFloat(mgmtFees) || 0) / 100;
    const ebitdaGr = (parseFloat(ebitdaGrowth) || 0) / 100;
    const exitMult = parseFloat(exitMultiple) || 0;
    const years = holdPeriod;
    const paydownPct = (parseFloat(debtPaydown) || 0) / 100;

    const enterpriseValue = eb * entMult;
    const totalDebt = eb * debtMult;
    const equityCheck = enterpriseValue - totalDebt;
    if (equityCheck <= 0) return null;

    const equityCheckAfterFees = equityCheck * (1 - fees);
    const debtToEV = totalDebt / enterpriseValue;
    const debtToEbitda = debtMult;

    // Year-by-year projection
    let remainingDebt = totalDebt;
    let ebitdaT = eb;
    const rows: Array<{
      year: number; ebitda: number; interest: number;
      fcf: number; debtPaydown: number; debtBalance: number;
    }> = [];

    for (let y = 1; y <= years; y++) {
      ebitdaT *= (1 + ebitdaGr);
      const interest = remainingDebt * intRate;
      // Assume ~50% EBITDA → FCF conversion (rough PE model)
      const fcf = ebitdaT * 0.50 - interest;
      const paid = Math.max(0, fcf * paydownPct);
      remainingDebt = Math.max(0, remainingDebt - paid);
      rows.push({ year: y, ebitda: ebitdaT, interest, fcf, debtPaydown: paid, debtBalance: remainingDebt });
    }

    const exitEbitda = rows[rows.length - 1]?.ebitda ?? eb;
    const exitEV = exitEbitda * exitMult;
    const exitDebt = rows[rows.length - 1]?.debtBalance ?? totalDebt;
    const exitEquity = exitEV - exitDebt;

    const moicVal = exitEquity / equityCheckAfterFees;
    const irr = calcIRR(equityCheckAfterFees, exitEquity, years);

    // Sensitivity: IRR across entry × exit multiples
    const entryRange = [8, 9, 10, 11, 12];
    const exitRange  = [8, 9, 10, 11, 12];
    const sensi = entryRange.map(ent => {
      return exitRange.map(ex => {
        const evE = eb * ent;
        const debtE = eb * debtMult;
        const eqE = (evE - debtE) * (1 - fees);
        if (eqE <= 0) return NaN;
        const evEx = exitEbitda * ex;
        const eqEx = evEx - exitDebt;
        return calcIRR(eqE, eqEx, years);
      });
    });

    return {
      enterpriseValue, totalDebt, equityCheck, equityCheckAfterFees,
      debtToEV, debtToEbitda, exitEV, exitDebt, exitEquity,
      moicVal, irr, rows, sensi, entryRange, exitRange, exitEbitda,
    };
  }, [ebitda, entryMultiple, debtMultiple, interestRate, mgmtFees,
      ebitdaGrowth, holdPeriod, exitMultiple, debtPaydown]);

  const irrColor = (v: number) => {
    if (!isFinite(v) || isNaN(v)) return "text-muted-foreground";
    if (v >= 25) return "text-emerald-500";
    if (v >= 18) return "text-primary";
    if (v >= 12) return "text-amber-500";
    return "text-red-500";
  };

  const cellBg = (v: number) => {
    if (!isFinite(v) || isNaN(v)) return "bg-muted/30 text-muted-foreground";
    if (v >= 25) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    if (v >= 18) return "bg-primary/10 text-primary";
    if (v >= 12) return "bg-amber-400/15 text-amber-700 dark:text-amber-400";
    return "bg-red-400/15 text-red-700 dark:text-red-400";
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Calculator size={18} className="text-primary" />
            <h1 className="text-xl font-bold tracking-tight">LBO Returns Calculator</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Model sponsor returns across entry/exit multiples, leverage, and hold period.{" "}
            <span className="text-[11px] italic opacity-70">est. — simplified model, for illustrative purposes only</span>
          </p>
        </div>

        {/* Prefill banner */}
        {prefillBanner && prefillParams?.companyName && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-4 py-2.5">
            <p className="text-xs text-violet-700 dark:text-violet-300">
              Pre-populated from <span className="font-semibold">{prefillParams.companyName}</span> analysis — LTM EBITDA carried over.
            </p>
            <button onClick={() => setPrefillBanner(false)} className="text-violet-400 hover:text-violet-600 flex-shrink-0 text-xs">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Left: Inputs ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Entry */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Entry Assumptions</p>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs mb-1.5 block">LTM EBITDA ($M)</Label>
                  <Input value={ebitda} onChange={e => setEbitda(e.target.value)} placeholder="100" data-testid="lbo-ebitda" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Entry EV/EBITDA</Label>
                    <Input value={entryMultiple} onChange={e => setEntryMultiple(e.target.value)} placeholder="10" data-testid="lbo-entry-multiple" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Debt / EBITDA</Label>
                    <Input value={debtMultiple} onChange={e => setDebtMultiple(e.target.value)} placeholder="5" data-testid="lbo-debt-multiple" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Interest Rate (%)</Label>
                    <Input value={interestRate} onChange={e => setInterestRate(e.target.value)} placeholder="7.5" data-testid="lbo-interest-rate" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Mgmt Fee / Tranx (%)</Label>
                    <Input value={mgmtFees} onChange={e => setMgmtFees(e.target.value)} placeholder="2" data-testid="lbo-fees" />
                  </div>
                </div>
              </div>
            </div>

            {/* Operations */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Operating Assumptions</p>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs mb-1.5 block">EBITDA Growth (% / yr)</Label>
                  <Input value={ebitdaGrowth} onChange={e => setEbitdaGrowth(e.target.value)} placeholder="8" data-testid="lbo-ebitda-growth" />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <Label className="text-xs">Hold Period</Label>
                    <span className="text-xs font-semibold text-primary">{holdPeriod} years</span>
                  </div>
                  <Slider
                    value={[holdPeriod]}
                    min={3} max={8} step={1}
                    onValueChange={([v]) => setHoldPeriod(v)}
                    data-testid="lbo-hold-period"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>3y</span><span>5y</span><span>8y</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Exit */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Exit Assumptions</p>
              <div>
                <Label className="text-xs mb-1.5 block">Exit EV/EBITDA</Label>
                <Input value={exitMultiple} onChange={e => setExitMultiple(e.target.value)} placeholder="11" data-testid="lbo-exit-multiple" />
              </div>
            </div>

            {/* Debt Amortization toggle */}
            <div className="rounded-xl border bg-card p-5">
              <button
                className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                onClick={() => setShowAmort(!showAmort)}
                data-testid="lbo-toggle-amort"
              >
                <span>Debt Amortization</span>
                {showAmort ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showAmort && (
                <div className="mt-4">
                  <Label className="text-xs mb-1.5 block">Annual FCF → Debt Paydown (%)</Label>
                  <Input value={debtPaydown} onChange={e => setDebtPaydown(e.target.value)} placeholder="20" />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Assumes ~50% EBITDA–FCF conversion; est. model simplification
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Outputs ── */}
          <div className="lg:col-span-3 space-y-5">

            {/* Key Returns */}
            {calc ? (
              <>
                <div className="rounded-xl border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Sponsor Returns</p>
                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <div className="rounded-lg bg-muted/40 p-4 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">IRR <span className="normal-case font-normal italic">(est.)</span></p>
                      <p className={`text-3xl font-bold font-mono ${irrColor(calc.irr)}`}>{pct(calc.irr)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{holdPeriod}-year hold</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-4 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">MOIC <span className="normal-case font-normal italic">(est.)</span></p>
                      <p className={`text-3xl font-bold font-mono ${irrColor(calc.irr)}`}>{moic(calc.moicVal)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">money-on-money</p>
                    </div>
                  </div>

                  <Separator className="mb-4" />

                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div>
                      <p className="text-muted-foreground mb-0.5">Entry EV</p>
                      <p className="font-semibold font-mono">{fmt(calc.enterpriseValue)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Equity Check</p>
                      <p className="font-semibold font-mono">{fmt(calc.equityCheckAfterFees)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Total Debt</p>
                      <p className="font-semibold font-mono">{fmt(calc.totalDebt)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">D/EBITDA</p>
                      <p className="font-semibold font-mono">{parseFloat(debtMultiple).toFixed(1)}x</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Exit EV <span className="italic">(est.)</span></p>
                      <p className="font-semibold font-mono">{fmt(calc.exitEV)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Exit Equity <span className="italic">(est.)</span></p>
                      <p className="font-semibold font-mono">{fmt(calc.exitEquity)}</p>
                    </div>
                  </div>

                  {/* Return quality badge */}
                  <div className="mt-4 flex justify-center">
                    {calc.irr >= 25 ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/15">
                        <TrendingUp size={11} className="mr-1" />Strong PE Return (≥25% IRR)
                      </Badge>
                    ) : calc.irr >= 18 ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                        <TrendingUp size={11} className="mr-1" />Acceptable Return (18–25% IRR)
                      </Badge>
                    ) : calc.irr >= 12 ? (
                      <Badge className="bg-amber-400/15 text-amber-600 border-amber-400/20 hover:bg-amber-400/15">
                        Below Hurdle (12–18% IRR)
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="bg-red-400/15 text-red-600 border-red-400/20 hover:bg-red-400/15">
                        <TrendingDown size={11} className="mr-1" />Unattractive (&lt;12% IRR)
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Sensitivity Table */}
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">IRR Sensitivity</p>
                    <span className="text-[10px] text-muted-foreground italic">entry EV/EBITDA (rows) × exit EV/EBITDA (cols) — est.</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr>
                          <th className="text-left text-muted-foreground font-medium pb-2 pr-3">Entry\Exit</th>
                          {calc.exitRange.map(ex => (
                            <th key={ex} className={`text-center pb-2 px-1 ${ex === parseFloat(exitMultiple) ? "text-primary font-bold" : "text-muted-foreground font-medium"}`}>
                              {ex}x
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {calc.sensi.map((row, ri) => (
                          <tr key={ri}>
                            <td className={`pr-3 py-1 font-medium ${calc.entryRange[ri] === parseFloat(entryMultiple) ? "text-primary font-bold" : "text-muted-foreground"}`}>
                              {calc.entryRange[ri]}x
                            </td>
                            {row.map((irr, ci) => (
                              <td key={ci} className="px-1 py-0.5">
                                <div className={`text-center rounded px-2 py-1 text-[11px] font-semibold ${cellBg(irr)}`}>
                                  {isNaN(irr) ? "—" : `${irr.toFixed(0)}%`}
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Year-by-Year Table */}
                <div className="rounded-xl border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                    Projection Schedule <span className="normal-case font-normal italic">(est. — simplified)</span>
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="text-left pb-2 font-medium">Year</th>
                          <th className="text-right pb-2 font-medium">EBITDA</th>
                          <th className="text-right pb-2 font-medium">Interest</th>
                          <th className="text-right pb-2 font-medium">FCF <span className="italic">(est.)</span></th>
                          <th className="text-right pb-2 font-medium">Debt Bal.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {calc.rows.map(r => (
                          <tr key={r.year} className="font-mono">
                            <td className="py-1.5 text-muted-foreground">Y{r.year}</td>
                            <td className="py-1.5 text-right">{fmt(r.ebitda)}</td>
                            <td className="py-1.5 text-right text-red-500/80">({fmt(r.interest)})</td>
                            <td className="py-1.5 text-right text-emerald-600">{fmt(r.fcf)}</td>
                            <td className="py-1.5 text-right">{fmt(r.debtBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-3 italic">
                    FCF assumes ~50% EBITDA conversion. Debt paydown per amortization settings. All figures estimated.
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-xl border bg-card p-10 flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
                <Calculator size={28} className="opacity-30" />
                <p className="text-sm">Check inputs — equity check must be positive</p>
                <p className="text-xs">(Debt cannot exceed Enterprise Value)</p>
              </div>
            )}

            {/* Benchmark reference */}
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-start gap-2">
                <Info size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p className="font-medium text-foreground">PE Return Benchmarks <span className="font-normal italic">(est. industry norms)</span></p>
                  <p>≥25% IRR · ≥2.5x MOIC — Strong / fundable deal for most buyout shops</p>
                  <p>18–25% IRR · 2.0–2.5x MOIC — Acceptable; passes hurdle for most funds</p>
                  <p>12–18% IRR — Below typical 20% hurdle rate; hard to justify for pure financial sponsor</p>
                  <p>&lt;12% IRR — Likely unattractive; would require compelling strategic rationale</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
