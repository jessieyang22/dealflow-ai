/**
 * Accretion / Dilution Model
 * Classic M&A EPS impact analysis: cash, stock, or mixed consideration.
 * All figures estimated and simplified for illustrative purposes.
 */
import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { TickerSearch, type TickerData } from "@/components/TickerSearch";
import {
  TrendingUp, TrendingDown, Minus, Info, ChevronDown, ChevronUp,
  DollarSign, BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(decimals)}`;
}
function pct(n: number) {
  if (!isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

interface Section {
  label: string;
  open: boolean;
}

// ─── model ──────────────────────────────────────────────────────────────────

function calcModel(inputs: {
  // Acquirer
  acqEPS: number; acqShares: number; acqPrice: number;
  // Target
  tgtNetIncome: number; tgtShares: number; tgtPrice: number;
  // Deal
  premiumPct: number; mixCash: number; // 0-100 cash, rest stock
  // Synergies
  revSynergies: number; costSynergies: number; taxRate: number;
  // Financing
  debtRate: number; cashYield: number;
}) {
  const {
    acqEPS, acqShares, acqPrice,
    tgtNetIncome, tgtShares, tgtPrice,
    premiumPct, mixCash,
    revSynergies, costSynergies, taxRate,
    debtRate, cashYield,
  } = inputs;

  const offerPricePerShare = tgtPrice * (1 + premiumPct / 100);
  const dealValue = offerPricePerShare * tgtShares;
  const cashPortion = dealValue * (mixCash / 100);
  const stockPortion = dealValue * ((100 - mixCash) / 100);

  // New shares issued (stock consideration at acquirer price)
  const newSharesIssued = acqPrice > 0 ? stockPortion / acqPrice : 0;
  const totalShares = acqShares + newSharesIssued;

  // EPS accretion model
  const acqNetIncome = acqEPS * acqShares;

  // Target net income contribution
  const tgtContribution = tgtNetIncome;

  // Cost & rev synergies after tax
  const synergiesAfterTax = (revSynergies + costSynergies) * (1 - taxRate / 100);

  // Financing cost: debt interest on cash portion (assuming debt-financed)
  const debtCost = (cashPortion * debtRate / 100) * (1 - taxRate / 100);

  // Opportunity cost on cash used (foregone yield)
  const cashCost = cashPortion * cashYield / 100 * (1 - taxRate / 100);

  const combinedNetIncome =
    acqNetIncome + tgtContribution + synergiesAfterTax - debtCost - cashCost;

  const proFormaEPS = totalShares > 0 ? combinedNetIncome / totalShares : 0;
  const standaloneEPS = acqEPS;
  const epsChange = proFormaEPS - standaloneEPS;
  const epsPctChange = standaloneEPS !== 0 ? (epsChange / Math.abs(standaloneEPS)) * 100 : 0;

  const isAccretive = epsChange > 0.005;
  const isDilutive = epsChange < -0.005;

  // Exchange ratio
  const exchangeRatio = acqPrice > 0 ? offerPricePerShare / acqPrice : 0;

  // Goodwill (simplified: deal value - target net assets proxy)
  const impliedGoodwill = dealValue - tgtNetIncome * 12; // rough 12x book proxy

  return {
    offerPricePerShare,
    dealValue,
    cashPortion,
    stockPortion,
    newSharesIssued,
    totalShares,
    combinedNetIncome,
    proFormaEPS,
    standaloneEPS,
    epsChange,
    epsPctChange,
    isAccretive,
    isDilutive,
    exchangeRatio,
    impliedGoodwill,
    synergiesAfterTax,
    debtCost,
    dilutionBreakeven: synergiesAfterTax > 0
      ? (debtCost - (tgtNetIncome - stockPortion / acqPrice * acqEPS)) / synergiesAfterTax * 100
      : null,
  };
}

// ─── component ──────────────────────────────────────────────────────────────

export default function AccretionDilution() {
  // Acquirer inputs
  const [acqEPS, setAcqEPS] = useState("4.50");
  const [acqShares, setAcqShares] = useState("500");
  const [acqPrice, setAcqPrice] = useState("85.00");
  const [acqName, setAcqName] = useState("");

  // Target inputs
  const [tgtNetIncome, setTgtNetIncome] = useState("120");
  const [tgtShares, setTgtShares] = useState("80");
  const [tgtPrice, setTgtPrice] = useState("42.00");
  const [tgtName, setTgtName] = useState("");

  // Deal structure
  const [premiumPct, setPremiumPct] = useState(30);
  const [mixCash, setMixCash] = useState(50); // % cash

  // Synergies & financing
  const [revSynergies, setRevSynergies] = useState("0");
  const [costSynergies, setCostSynergies] = useState("20");
  const [taxRate, setTaxRate] = useState("25");
  const [debtRate, setDebtRate] = useState("6.5");
  const [cashYield, setCashYield] = useState("4.5");

  const [advOpen, setAdvOpen] = useState(false);

  const result = useMemo(() => calcModel({
    acqEPS: parseFloat(acqEPS) || 0,
    acqShares: (parseFloat(acqShares) || 0) * 1e6,
    acqPrice: parseFloat(acqPrice) || 0,
    tgtNetIncome: (parseFloat(tgtNetIncome) || 0) * 1e6,
    tgtShares: (parseFloat(tgtShares) || 0) * 1e6,
    tgtPrice: parseFloat(tgtPrice) || 0,
    premiumPct,
    mixCash,
    revSynergies: (parseFloat(revSynergies) || 0) * 1e6,
    costSynergies: (parseFloat(costSynergies) || 0) * 1e6,
    taxRate: parseFloat(taxRate) || 25,
    debtRate: parseFloat(debtRate) || 6.5,
    cashYield: parseFloat(cashYield) || 4.5,
  }), [acqEPS, acqShares, acqPrice, tgtNetIncome, tgtShares, tgtPrice,
       premiumPct, mixCash, revSynergies, costSynergies, taxRate, debtRate, cashYield]);

  const handleAcqFill = (d: TickerData) => {
    if (d.name) setAcqName(d.name);
    if (d.price) setAcqPrice(d.price.toFixed(2));
    if (d.sharesMM) setAcqShares(d.sharesMM.toFixed(1));
    // Derive EPS: net income / shares (approx from EBITDA * 0.65 as net income proxy)
    if (d.ebitdaMM && d.sharesMM && d.sharesMM > 0) {
      const niProxy = d.ebitdaMM * 0.65;
      setAcqEPS((niProxy / d.sharesMM).toFixed(2));
    }
  };

  const handleTgtFill = (d: TickerData) => {
    if (d.name) setTgtName(d.name);
    if (d.price) setTgtPrice(d.price.toFixed(2));
    if (d.sharesMM) setTgtShares(d.sharesMM.toFixed(1));
    if (d.ebitdaMM && d.sharesMM && d.sharesMM > 0) {
      const niProxy = d.ebitdaMM * 0.65;
      setTgtNetIncome((niProxy).toFixed(0));
    }
  };

  const verdictColor = result.isAccretive
    ? "text-emerald-600 dark:text-emerald-400"
    : result.isDilutive
    ? "text-red-500 dark:text-red-400"
    : "text-yellow-500";

  const verdictLabel = result.isAccretive ? "Accretive" : result.isDilutive ? "Dilutive" : "Neutral";
  const VerdictIcon = result.isAccretive ? TrendingUp : result.isDilutive ? TrendingDown : Minus;

  // Sensitivity: EPS at different cash mix %
  const sensitivity = [0, 25, 50, 75, 100].map(cash => {
    const r = calcModel({
      acqEPS: parseFloat(acqEPS) || 0,
      acqShares: (parseFloat(acqShares) || 0) * 1e6,
      acqPrice: parseFloat(acqPrice) || 0,
      tgtNetIncome: (parseFloat(tgtNetIncome) || 0) * 1e6,
      tgtShares: (parseFloat(tgtShares) || 0) * 1e6,
      tgtPrice: parseFloat(tgtPrice) || 0,
      premiumPct, mixCash: cash,
      revSynergies: (parseFloat(revSynergies) || 0) * 1e6,
      costSynergies: (parseFloat(costSynergies) || 0) * 1e6,
      taxRate: parseFloat(taxRate) || 25,
      debtRate: parseFloat(debtRate) || 6.5,
      cashYield: parseFloat(cashYield) || 4.5,
    });
    return { cash, eps: r.proFormaEPS, chg: r.epsPctChange };
  });

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 size={18} className="text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Accretion / Dilution Model</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            EPS impact of a proposed acquisition — cash, stock, or mixed consideration.{" "}
            <span className="italic text-xs">est. — simplified model, for illustrative purposes only</span>
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

          {/* ── Left: Inputs ── */}
          <div className="xl:col-span-2 space-y-4">

            {/* Acquirer */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Acquirer</p>
                <TickerSearch onFill={handleAcqFill} compact />
              </div>
              {acqName && <p className="text-xs font-medium text-foreground mb-3">{acqName}</p>}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">EPS ($)</Label>
                  <Input value={acqEPS} onChange={e => setAcqEPS(e.target.value)} placeholder="4.50" data-testid="acq-eps" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Shares (M)</Label>
                  <Input value={acqShares} onChange={e => setAcqShares(e.target.value)} placeholder="500" data-testid="acq-shares" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Price ($)</Label>
                  <Input value={acqPrice} onChange={e => setAcqPrice(e.target.value)} placeholder="85.00" data-testid="acq-price" />
                </div>
              </div>
            </div>

            {/* Target */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target</p>
                <TickerSearch onFill={handleTgtFill} compact />
              </div>
              {tgtName && <p className="text-xs font-medium text-foreground mb-3">{tgtName}</p>}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Net Income ($M)</Label>
                  <Input value={tgtNetIncome} onChange={e => setTgtNetIncome(e.target.value)} placeholder="120" data-testid="tgt-ni" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Shares (M)</Label>
                  <Input value={tgtShares} onChange={e => setTgtShares(e.target.value)} placeholder="80" data-testid="tgt-shares" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Price ($)</Label>
                  <Input value={tgtPrice} onChange={e => setTgtPrice(e.target.value)} placeholder="42.00" data-testid="tgt-price" />
                </div>
              </div>
            </div>

            {/* Deal Structure */}
            <div className="rounded-xl border bg-card p-5 space-y-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deal Structure</p>

              <div>
                <div className="flex justify-between mb-2">
                  <Label className="text-xs">Acquisition Premium</Label>
                  <span className="text-xs font-semibold text-primary">{premiumPct}%</span>
                </div>
                <Slider
                  min={0} max={80} step={1} value={[premiumPct]}
                  onValueChange={([v]) => setPremiumPct(v)}
                  data-testid="premium-slider"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>0%</span><span>40%</span><span>80%</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <Label className="text-xs">Cash / Stock Mix</Label>
                  <span className="text-xs font-semibold">{mixCash}% cash · {100 - mixCash}% stock</span>
                </div>
                <Slider
                  min={0} max={100} step={5} value={[mixCash]}
                  onValueChange={([v]) => setMixCash(v)}
                  data-testid="mix-slider"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>All Stock</span><span>50/50</span><span>All Cash</span>
                </div>
              </div>
            </div>

            {/* Synergies & Financing */}
            <div className="rounded-xl border bg-card p-5">
              <button
                onClick={() => setAdvOpen(o => !o)}
                className="flex items-center justify-between w-full mb-1"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Synergies &amp; Financing
                </p>
                {advOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {advOpen && (
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <Label className="text-xs mb-1.5 block">Rev. Synergies ($M/yr)</Label>
                    <Input value={revSynergies} onChange={e => setRevSynergies(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Cost Synergies ($M/yr)</Label>
                    <Input value={costSynergies} onChange={e => setCostSynergies(e.target.value)} placeholder="20" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Tax Rate (%)</Label>
                    <Input value={taxRate} onChange={e => setTaxRate(e.target.value)} placeholder="25" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Debt Rate (%)</Label>
                    <Input value={debtRate} onChange={e => setDebtRate(e.target.value)} placeholder="6.5" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Cash Yield (%)</Label>
                    <Input value={cashYield} onChange={e => setCashYield(e.target.value)} placeholder="4.5" />
                  </div>
                </div>
              )}
              {!advOpen && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Cost synergies: ${costSynergies}M · Debt rate: {debtRate}% · Tax: {taxRate}%
                </p>
              )}
            </div>
          </div>

          {/* ── Right: Output ── */}
          <div className="xl:col-span-3 space-y-4">

            {/* Verdict */}
            <div className={cn(
              "rounded-xl border p-5",
              result.isAccretive
                ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                : result.isDilutive
                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
            )}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                EPS Impact — Verdict <span className="italic normal-case font-normal">(est.)</span>
              </p>
              <div className="flex items-center gap-3">
                <VerdictIcon size={22} className={verdictColor} />
                <span className={cn("text-2xl font-bold", verdictColor)}>{verdictLabel}</span>
                <span className={cn("text-lg font-semibold", verdictColor)}>
                  {pct(result.epsPctChange)} <span className="text-sm font-normal">EPS impact</span>
                </span>
              </div>
              <div className="flex gap-6 mt-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">Standalone EPS (est.)</p>
                  <p className="text-base font-bold">${result.standaloneEPS.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Pro Forma EPS (est.)</p>
                  <p className={cn("text-base font-bold", verdictColor)}>
                    ${isFinite(result.proFormaEPS) ? result.proFormaEPS.toFixed(2) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">EPS Δ (est.)</p>
                  <p className={cn("text-base font-bold", verdictColor)}>
                    {result.epsChange >= 0 ? "+" : ""}
                    {isFinite(result.epsChange) ? result.epsChange.toFixed(2) : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Deal metrics */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                Deal Metrics <span className="italic normal-case font-normal text-muted-foreground">(est.)</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: "Offer Price / Share (est.)", val: `$${result.offerPricePerShare.toFixed(2)}` },
                  { label: "Deal Value (est.)", val: fmt(result.dealValue) },
                  { label: "Cash Portion (est.)", val: fmt(result.cashPortion) },
                  { label: "Stock Portion (est.)", val: fmt(result.stockPortion) },
                  { label: "New Shares Issued (est.)", val: `${(result.newSharesIssued / 1e6).toFixed(1)}M` },
                  { label: "Exchange Ratio (est.)", val: result.exchangeRatio.toFixed(4) + "x" },
                  { label: "Pro Forma Shares (est.)", val: `${(result.totalShares / 1e6).toFixed(1)}M` },
                  { label: "After-Tax Synergies (est.)", val: fmt(result.synergiesAfterTax) },
                  { label: "Annual Debt Cost (est.)", val: fmt(result.debtCost) },
                ].map(({ label, val }) => (
                  <div key={label} className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                    <p className="text-sm font-semibold">{val}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Cash / Stock sensitivity table */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                Consideration Mix Sensitivity <span className="italic normal-case font-normal">(est.)</span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 text-muted-foreground font-medium">Cash %</th>
                      <th className="text-left py-2 text-muted-foreground font-medium">Stock %</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Pro Forma EPS (est.)</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">EPS Δ% (est.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivity.map(({ cash, eps, chg }) => (
                      <tr
                        key={cash}
                        className={cn(
                          "border-b last:border-0",
                          cash === mixCash ? "bg-primary/5" : ""
                        )}
                      >
                        <td className="py-2 font-medium">{cash}%</td>
                        <td className="py-2">{100 - cash}%</td>
                        <td className={cn("py-2 text-right font-semibold mono",
                          chg > 0.05 ? "text-emerald-600 dark:text-emerald-400" :
                          chg < -0.05 ? "text-red-500" : "text-yellow-600"
                        )}>
                          ${isFinite(eps) ? eps.toFixed(2) : "—"}
                        </td>
                        <td className={cn("py-2 text-right",
                          chg > 0.05 ? "text-emerald-600 dark:text-emerald-400" :
                          chg < -0.05 ? "text-red-500" : "text-yellow-600"
                        )}>
                          {pct(chg)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Methodology note */}
            <div className="rounded-xl border bg-muted/30 p-4 flex gap-3">
              <Info size={14} className="text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-semibold">Methodology (est. — simplified):</span>{" "}
                Pro forma EPS = (Acquirer NI + Target NI + After-tax synergies − Debt interest − Cash opportunity cost)
                ÷ (Acquirer shares + New shares issued at acquirer price). Acquirer NI derived from EPS × shares.
                Debt financing assumed for cash portion. Not investment advice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
