/**
 * Merger Model — Combined P&L
 * Combines acquirer + target income statements, applies synergies,
 * shows pro forma revenue, EBITDA, and EPS for the combined entity.
 */
import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { TickerSearch } from "@/components/TickerSearch";
import type { TickerData } from "@/components/TickerSearch";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from "recharts";
import {
  Merge, TrendingUp, DollarSign, Users, BarChart2, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number, dec = 1) => isFinite(n) ? `$${Math.abs(n) >= 1000 ? (n/1000).toFixed(1)+"B" : n.toFixed(dec)+"M"}` : "—";
const fmtPct = (n: number) => isFinite(n) ? `${n.toFixed(1)}%` : "—";
const fmtX = (n: number) => isFinite(n) ? `${n.toFixed(1)}x` : "—";
const fmtEPS = (n: number) => isFinite(n) ? `$${n.toFixed(2)}` : "—";
const delta = (n: number) => n >= 0 ? `+${n.toFixed(1)}%` : `${n.toFixed(1)}%`;

// ── Input section ─────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-lg overflow-hidden bg-card mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        {title}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 items-center mb-2">
      <Label className="text-xs text-muted-foreground col-span-1">{label}</Label>
      <div className="col-span-2 grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function NumInput({ value, onChange, prefix = "$", suffix = "M" }: {
  value: number; onChange: (v: number) => void; prefix?: string; suffix?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span>
      <Input
        type="number"
        className="h-7 text-xs pl-6 pr-6"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KPI({ label, value, change, accent }: {
  label: string; value: string; change?: string; accent?: boolean;
}) {
  const pos = change?.startsWith("+");
  const neg = change?.startsWith("-");
  return (
    <div className={cn("border rounded-lg p-3 bg-card", accent && "border-primary/40 bg-primary/5")}>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-lg font-bold", accent && "text-primary")}>{value}</p>
      {change && (
        <p className={cn("text-[11px] font-medium mt-0.5", pos && "text-emerald-400", neg && "text-red-400")}>
          {change} vs. standalone
        </p>
      )}
    </div>
  );
}

// ── Comparison table row ──────────────────────────────────────────────────────
function TableRow({ label, acq, tgt, combined, highlight }: {
  label: string; acq: string; tgt: string; combined: string; highlight?: boolean;
}) {
  return (
    <tr className={cn("border-b border-border/50 text-xs", highlight && "bg-primary/5 font-semibold")}>
      <td className="py-2 px-3 text-muted-foreground">{label}</td>
      <td className="py-2 px-3 text-right">{acq}</td>
      <td className="py-2 px-3 text-right">{tgt}</td>
      <td className="py-2 px-3 text-right text-primary font-medium">{combined}</td>
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MergerModel() {
  // Acquirer
  const [acqName,    setAcqName]    = useState("Acquirer");
  const [acqRev,     setAcqRev]     = useState(5000);
  const [acqEBITDA,  setAcqEBITDA]  = useState(1250);
  const [acqDA,      setAcqDA]      = useState(400);
  const [acqInterest,setAcqInterest]= useState(150);
  const [acqTax,     setAcqTax]     = useState(21);
  const [acqShares,  setAcqShares]  = useState(500);
  const [acqDebt,    setAcqDebt]    = useState(1200);

  // Target
  const [tgtName,    setTgtName]    = useState("Target");
  const [tgtRev,     setTgtRev]     = useState(1800);
  const [tgtEBITDA,  setTgtEBITDA]  = useState(360);
  const [tgtDA,      setTgtDA]      = useState(120);
  const [tgtInterest,setTgtInterest]= useState(55);
  const [tgtTax,     setTgtTax]     = useState(21);
  const [tgtDebt,    setTgtDebt]    = useState(400);

  // Deal structure
  const [dealPremium,  setDealPremium]  = useState(30);     // %
  const [cashPct,      setCashPct]      = useState(50);     // %
  const [newDebt,      setNewDebt]      = useState(500);    // $M new debt for cash portion
  const [newDebtRate,  setNewDebtRate]  = useState(5.5);    // %
  const [tgtSharePrice,setTgtSharePrice]= useState(42);     // $ per share
  const [tgtSharesMM,  setTgtSharesMM]  = useState(80);     // M shares

  // Synergies
  const [revSyn,  setRevSyn]  = useState(80);   // $M
  const [costSyn, setCostSyn] = useState(120);  // $M

  // Ticker fill
  const handleAcqFill = (t: TickerData) => {
    setAcqName(t.name || t.symbol);
    if (t.revenue)  setAcqRev(t.revenue / 1e6);
    if (t.ebitda)   setAcqEBITDA(t.ebitda / 1e6);
    if (t.netDebt)  setAcqDebt(t.netDebt / 1e6);
    if (t.shares)   setAcqShares(t.shares / 1e6);
    if (t.price)    {}
  };
  const handleTgtFill = (t: TickerData) => {
    setTgtName(t.name || t.symbol);
    if (t.revenue)  setTgtRev(t.revenue / 1e6);
    if (t.ebitda)   setTgtEBITDA(t.ebitda / 1e6);
    if (t.netDebt)  setTgtDebt(t.netDebt / 1e6);
    if (t.price)    setTgtSharePrice(t.price);
    if (t.shares)   setTgtSharesMM(t.shares / 1e6);
  };

  // ── Model calculations ────────────────────────────────────────────────────
  const model = useMemo(() => {
    const stockPct = 100 - cashPct;
    const dealEV = tgtSharePrice * (1 + dealPremium / 100) * tgtSharesMM;  // $M
    const cashConsideration = dealEV * (cashPct / 100);
    const stockConsideration = dealEV * (stockPct / 100);

    // New shares issued (at current acq price — approximate)
    // We'll use a rough $85/share placeholder if not filled from ticker
    const acqPrice = 85;
    const newSharesMM = stockConsideration / acqPrice;

    // Pro forma combined income statement
    const pfRev    = acqRev + tgtRev + revSyn;
    const pfEBITDA = acqEBITDA + tgtEBITDA + costSyn + revSyn * 0.6; // 60% EBITDA flow-through on rev syn
    const pfDA     = acqDA + tgtDA;
    const pfEBIT   = pfEBITDA - pfDA;
    const pfInterest = acqInterest + tgtInterest + newDebt * (newDebtRate / 100);
    const pfEBT    = pfEBIT - pfInterest;
    const pfTax    = pfEBT * ((acqTax / 100 + tgtTax / 100) / 2);
    const pfNI     = pfEBT - pfTax;
    const pfShares = acqShares + newSharesMM;
    const pfEPS    = pfNI / pfShares;

    // Standalone acquirer EPS
    const acqEBIT = acqEBITDA - acqDA;
    const acqEBT  = acqEBIT - acqInterest;
    const acqNI   = acqEBT * (1 - acqTax / 100);
    const acqEPS  = acqNI / acqShares;

    const epsChangePct = acqEPS > 0 ? ((pfEPS - acqEPS) / Math.abs(acqEPS)) * 100 : 0;
    const accretive    = epsChangePct > 0.5;
    const dilutive     = epsChangePct < -0.5;

    // Margins
    const acqEBITDAMgn = acqRev > 0 ? (acqEBITDA / acqRev) * 100 : 0;
    const tgtEBITDAMgn = tgtRev > 0 ? (tgtEBITDA / tgtRev) * 100 : 0;
    const pfEBITDAMgn  = pfRev > 0 ? (pfEBITDA / pfRev) * 100 : 0;

    // Combined leverage
    const pfNetDebt = acqDebt + tgtDebt + newDebt - cashConsideration * 0.1;
    const pfLeverage = pfEBITDA > 0 ? pfNetDebt / pfEBITDA : NaN;

    // Chart data
    const chartData = [
      { name: "Revenue", Acquirer: acqRev, Target: tgtRev, ProForma: pfRev },
      { name: "EBITDA",  Acquirer: acqEBITDA, Target: tgtEBITDA, ProForma: pfEBITDA },
    ];

    return {
      pfRev, pfEBITDA, pfDA, pfEBIT, pfInterest, pfEBT, pfNI, pfShares, pfEPS,
      acqEPS, epsChangePct, accretive, dilutive,
      acqEBITDAMgn, tgtEBITDAMgn, pfEBITDAMgn,
      pfNetDebt, pfLeverage,
      dealEV, cashConsideration, stockConsideration, newSharesMM,
      chartData,
    };
  }, [
    acqRev, acqEBITDA, acqDA, acqInterest, acqTax, acqShares, acqDebt,
    tgtRev, tgtEBITDA, tgtDA, tgtInterest, tgtTax, tgtDebt,
    dealPremium, cashPct, newDebt, newDebtRate, tgtSharePrice, tgtSharesMM,
    revSyn, costSyn,
  ]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <Merge size={18} className="text-primary mt-0.5" />
          <div>
            <h1 className="text-xl font-bold">Merger Model</h1>
            <p className="text-sm text-muted-foreground">
              Combined P&L — pro forma revenue, EBITDA, and EPS for the merged entity.{" "}
              <span className="italic text-muted-foreground/70">est. — simplified model, illustrative only</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ── Left: Inputs ───────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-0">

            {/* Acquirer */}
            <Section title="Acquirer">
              <div className="mb-3">
                <TickerSearch onSelect={handleAcqFill} placeholder="e.g. MSFT, EA, T…" />
              </div>
              <div className="mb-2">
                <Label className="text-xs text-muted-foreground">Company Name</Label>
                <Input className="h-7 text-xs mt-1" value={acqName} onChange={e => setAcqName(e.target.value)} />
              </div>
              <Row label="Revenue ($M)">
                <NumInput value={acqRev} onChange={setAcqRev} /><span />
              </Row>
              <Row label="EBITDA ($M)">
                <NumInput value={acqEBITDA} onChange={setAcqEBITDA} /><span />
              </Row>
              <Row label="D&A ($M)">
                <NumInput value={acqDA} onChange={setAcqDA} /><span />
              </Row>
              <Row label="Interest ($M)">
                <NumInput value={acqInterest} onChange={setAcqInterest} /><span />
              </Row>
              <Row label="Tax Rate (%)">
                <NumInput value={acqTax} onChange={setAcqTax} prefix="" suffix="%" /><span />
              </Row>
              <Row label="Diluted Shares (M)">
                <NumInput value={acqShares} onChange={setAcqShares} prefix="" suffix="M" /><span />
              </Row>
              <Row label="Net Debt ($M)">
                <NumInput value={acqDebt} onChange={setAcqDebt} /><span />
              </Row>
            </Section>

            {/* Target */}
            <Section title="Target">
              <div className="mb-3">
                <TickerSearch onSelect={handleTgtFill} placeholder="e.g. WBD, ATVI, VMW…" />
              </div>
              <div className="mb-2">
                <Label className="text-xs text-muted-foreground">Company Name</Label>
                <Input className="h-7 text-xs mt-1" value={tgtName} onChange={e => setTgtName(e.target.value)} />
              </div>
              <Row label="Revenue ($M)">
                <NumInput value={tgtRev} onChange={setTgtRev} /><span />
              </Row>
              <Row label="EBITDA ($M)">
                <NumInput value={tgtEBITDA} onChange={setTgtEBITDA} /><span />
              </Row>
              <Row label="D&A ($M)">
                <NumInput value={tgtDA} onChange={setTgtDA} /><span />
              </Row>
              <Row label="Interest ($M)">
                <NumInput value={tgtInterest} onChange={setTgtInterest} /><span />
              </Row>
              <Row label="Tax Rate (%)">
                <NumInput value={tgtTax} onChange={setTgtTax} prefix="" suffix="%" /><span />
              </Row>
              <Row label="Share Price ($)">
                <NumInput value={tgtSharePrice} onChange={setTgtSharePrice} prefix="$" suffix="" /><span />
              </Row>
              <Row label="Shares Out (M)">
                <NumInput value={tgtSharesMM} onChange={setTgtSharesMM} prefix="" suffix="M" /><span />
              </Row>
              <Row label="Net Debt ($M)">
                <NumInput value={tgtDebt} onChange={setTgtDebt} /><span />
              </Row>
            </Section>

            {/* Deal Structure */}
            <Section title="Deal Structure">
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <Label className="text-muted-foreground">Acquisition Premium</Label>
                    <span className="font-semibold text-primary">{dealPremium}%</span>
                  </div>
                  <Slider min={0} max={60} step={1} value={[dealPremium]} onValueChange={([v]) => setDealPremium(v)} />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <Label className="text-muted-foreground">Cash / Stock Mix</Label>
                    <span className="font-medium">{cashPct}% cash · {100-cashPct}% stock</span>
                  </div>
                  <Slider min={0} max={100} step={5} value={[cashPct]} onValueChange={([v]) => setCashPct(v)} />
                </div>
                <Row label="New Debt ($M)">
                  <NumInput value={newDebt} onChange={setNewDebt} /><span />
                </Row>
                <Row label="Debt Rate (%)">
                  <NumInput value={newDebtRate} onChange={setNewDebtRate} prefix="" suffix="%" /><span />
                </Row>
              </div>
            </Section>

            {/* Synergies */}
            <Section title="Synergies (est.)">
              <Row label="Revenue Synergies ($M/yr)">
                <NumInput value={revSyn} onChange={setRevSyn} /><span />
              </Row>
              <Row label="Cost Synergies ($M/yr)">
                <NumInput value={costSyn} onChange={setCostSyn} /><span />
              </Row>
            </Section>
          </div>

          {/* ── Right: Output ───────────────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-5">

            {/* EPS Verdict */}
            <div className={cn(
              "border rounded-xl p-5",
              model.accretive ? "border-emerald-500/30 bg-emerald-500/5"
                : model.dilutive ? "border-red-500/30 bg-red-500/5"
                : "border-border bg-card"
            )}>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                EPS Impact — Verdict <span className="italic normal-case">(est.)</span>
              </p>
              <div className="flex items-baseline gap-3 mb-3">
                <span className={cn(
                  "text-2xl font-extrabold",
                  model.accretive ? "text-emerald-400"
                    : model.dilutive ? "text-red-400"
                    : "text-foreground"
                )}>
                  {model.accretive ? "Accretive" : model.dilutive ? "Dilutive" : "Neutral"}
                </span>
                <span className={cn(
                  "text-lg font-bold",
                  model.epsChangePct >= 0 ? "text-emerald-400" : "text-red-400"
                )}>
                  {delta(model.epsChangePct)} EPS impact
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Standalone EPS (est.)</p>
                  <p className="text-base font-bold">{fmtEPS(model.acqEPS)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Pro Forma EPS (est.)</p>
                  <p className={cn("text-base font-bold", model.accretive ? "text-emerald-400" : "text-red-400")}>
                    {fmtEPS(model.pfEPS)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">EPS Δ (est.)</p>
                  <p className={cn("text-base font-bold", model.epsChangePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {fmtEPS(model.pfEPS - model.acqEPS)}
                  </p>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPI label="Pro Forma Revenue (est.)" value={fmt(model.pfRev)} change={delta((model.pfRev / (acqRev + tgtRev) - 1) * 100)} accent />
              <KPI label="Pro Forma EBITDA (est.)" value={fmt(model.pfEBITDA)} change={delta((model.pfEBITDA / (acqEBITDA + tgtEBITDA) - 1) * 100)} />
              <KPI label="EBITDA Margin (est.)" value={fmtPct(model.pfEBITDAMgn)} />
              <KPI label="Pro Forma Leverage (est.)" value={fmtX(model.pfLeverage)} />
            </div>

            {/* Bar chart */}
            <div className="border rounded-xl p-4 bg-card">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Combined Scale <span className="italic normal-case font-normal">(est. — after synergies)</span>
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={model.chartData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}B`} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Acquirer" fill="hsl(var(--muted-foreground) / 0.4)" name={`${acqName} (est.)`} />
                  <Bar dataKey="Target"   fill="hsl(var(--muted-foreground) / 0.25)" name={`${tgtName} (est.)`} />
                  <Bar dataKey="ProForma" fill="hsl(var(--primary))" name="Pro Forma (est.)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Combined P&L table */}
            <div className="border rounded-xl bg-card overflow-hidden">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-2">
                Pro Forma Income Statement <span className="italic normal-case">(est. — LTM run-rate, after synergies)</span>
              </p>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left py-2 px-3">Line Item</th>
                    <th className="text-right py-2 px-3">{acqName} (est.)</th>
                    <th className="text-right py-2 px-3">{tgtName} (est.)</th>
                    <th className="text-right py-2 px-3 text-primary">Pro Forma (est.)</th>
                  </tr>
                </thead>
                <tbody>
                  <TableRow label="Revenue"       acq={fmt(acqRev)}     tgt={fmt(tgtRev)}     combined={fmt(model.pfRev)} />
                  <TableRow label="EBITDA"        acq={fmt(acqEBITDA)}  tgt={fmt(tgtEBITDA)}  combined={fmt(model.pfEBITDA)} highlight />
                  <TableRow label="EBITDA Margin" acq={fmtPct(acqEBITDA/acqRev*100)} tgt={fmtPct(tgtEBITDA/tgtRev*100)} combined={fmtPct(model.pfEBITDAMgn)} />
                  <TableRow label="D&A"           acq={fmt(acqDA)}      tgt={fmt(tgtDA)}       combined={fmt(model.pfDA)} />
                  <TableRow label="EBIT"          acq={fmt(acqEBITDA - acqDA)} tgt={fmt(tgtEBITDA - tgtDA)} combined={fmt(model.pfEBIT)} />
                  <TableRow label="Interest"      acq={fmt(acqInterest)} tgt={fmt(tgtInterest)} combined={fmt(model.pfInterest)} />
                  <TableRow label="EBT"           acq={fmt(acqEBITDA - acqDA - acqInterest)} tgt={fmt(tgtEBITDA - tgtDA - tgtInterest)} combined={fmt(model.pfEBT)} />
                  <TableRow label="Net Income"    acq={fmt((acqEBITDA-acqDA-acqInterest)*(1-acqTax/100))} tgt={fmt((tgtEBITDA-tgtDA-tgtInterest)*(1-tgtTax/100))} combined={fmt(model.pfNI)} highlight />
                  <TableRow label="Diluted Shares" acq={`${acqShares.toFixed(0)}M`} tgt="—" combined={`${model.pfShares.toFixed(0)}M`} />
                  <TableRow label="EPS"           acq={fmtEPS(model.acqEPS)} tgt="—" combined={fmtEPS(model.pfEPS)} highlight />
                  <TableRow label="Synergies (est.)" acq="—" tgt="—" combined={fmt(revSyn + costSyn)} />
                  <TableRow label="Net Debt"      acq={fmt(acqDebt)}    tgt={fmt(tgtDebt)}     combined={fmt(model.pfNetDebt)} />
                  <TableRow label="Net Leverage"  acq={fmtX(acqDebt/acqEBITDA)} tgt={fmtX(tgtDebt/tgtEBITDA)} combined={fmtX(model.pfLeverage)} />
                </tbody>
              </table>
            </div>

            {/* Disclaimer */}
            <p className="text-[10px] text-muted-foreground border rounded-md px-3 py-2 bg-muted/20">
              Merger model outputs are simplified estimates for illustrative purposes only. Assumes synergies are fully realized at run-rate; actual realization is typically 2–3 years. Not investment advice.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
