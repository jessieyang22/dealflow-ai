import React, { useState, useMemo, useCallback } from "react";
import { TickerSearch } from "@/components/TickerSearch";
import type { TickerData } from "@/components/TickerSearch";
import { useAuth, getAuthToken } from "../lib/auth";
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
  FileText, Edit3, Check, RefreshCw,
  Mail, BookmarkPlus, Clock, Trash2, X, Send,
  FileDown, Brain, SlidersHorizontal,
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


// ── Methodology Notes Panel ───────────────────────────────────────────────────

interface MethodologySection {
  id: string;
  title: string;
  autoNote: string;
  icon: React.ReactNode;
  accentClass: string;
}

function MethodologyNotes({
  dcfWaccLow, dcfWaccHigh,
  terminalMultLow, terminalMultHigh,
  exitMultLow, exitMultHigh,
  holdYears,
  debtMult, interestRate,
  ebitdaGrowth,
  ebitdaMarginPct,
  revenueGrowth,
  lboMidIRR,
  dcfMid, lboMid,
  curPrice,
  companyName,
  onNotesChange,
}: {
  dcfWaccLow: string; dcfWaccHigh: string;
  terminalMultLow: string; terminalMultHigh: string;
  exitMultLow: string; exitMultHigh: string;
  holdYears: number;
  debtMult: string; interestRate: string;
  ebitdaGrowth: string;
  ebitdaMarginPct: number;
  revenueGrowth: string;
  lboMidIRR: number;
  dcfMid: number; lboMid: number;
  curPrice: number;
  companyName: string;
  onNotesChange?: (notes: { wacc: string; tv: string; lbo: string; verdict: string }) => void;
}) {
  // Auto-generate associate-style annotations from live inputs
  const waccLo = parseFloat(dcfWaccLow) || 9;
  const waccHi = parseFloat(dcfWaccHigh) || 11;
  const tvLo = parseFloat(terminalMultLow) || 10;
  const tvHi = parseFloat(terminalMultHigh) || 14;
  const exitLo = parseFloat(exitMultLow) || 9;
  const exitHi = parseFloat(exitMultHigh) || 12;
  const dm = parseFloat(debtMult) || 5;
  const ir = parseFloat(interestRate) || 7.5;
  const ebGrowth = parseFloat(ebitdaGrowth) || 8;
  const revGr = parseFloat(revenueGrowth) || 15;
  const marginPct = Math.round(ebitdaMarginPct * 100);

  // WACC rationale
  const leverageAdj = dm >= 6 ? "elevated leverage" : dm >= 4 ? "moderate leverage" : "conservative leverage";
  const waccContext = waccLo <= 8 ? "investment-grade credit profile" : waccLo <= 10 ? "BB/BB+ credit profile" : "leveraged capital structure";
  const waccNote = `WACC range of ${waccLo}–${waccHi}% reflects a blended cost of capital consistent with a ${waccContext}. ` +
    `The spread captures beta uncertainty and ${leverageAdj} post-close. ` +
    `Bear case applies ${waccHi}% (higher discount rate compresses PV of terminal value); ` +
    `bull case uses ${waccLo}% assuming multiple expansion and de-leveraging over the projection period.`;

  // Terminal value / TV multiple rationale
  const tvSpread = tvHi - tvLo;
  const tvTight = tvSpread <= 3 ? "tight range" : tvSpread <= 5 ? "moderate range" : "wide range";
  const tvContext = tvLo >= 14 ? "premium growth multiple" : tvLo >= 10 ? "market-rate EV/EBITDA exit" : "conservative terminal assumption";
  const tvNote = `Terminal value anchored to an EV/EBITDA exit multiple of ${tvLo}x–${tvHi}x — a ${tvTight} reflecting a ${tvContext}. ` +
    `TV accounts for the majority of DCF value; sensitivity to terminal multiple is material at a ${revGr}% revenue CAGR. ` +
    `Range calibrated to sector trading comps and precedent transaction premia — analysts should stress-test vs. current sector medians.`;

  // LBO structure rationale
  const debtCoverage = (ir * dm).toFixed(1);
  const irrTier = lboMidIRR >= 25 ? "top-quartile return profile" : lboMidIRR >= 20 ? "institutional-grade IRR" : lboMidIRR >= 15 ? "acceptable PE return" : "below-hurdle return";
  const lboNote = `Structure assumes ${dm}x debt/EBITDA at entry, implying ~${debtCoverage}% cash interest burden on LTM EBITDA. ` +
    `At ${ir}% blended cost of debt, free cash flow covers interest with ${marginPct}% EBITDA margin. ` +
    `Exit at ${exitLo}x–${exitHi}x over ${holdYears} years, with ${ebGrowth}% EBITDA CAGR, ` +
    `generates a ${irrTier}${isFinite(lboMidIRR) ? ` (~${lboMidIRR.toFixed(1)}% IRR mid)` : ""}. ` +
    `Debt paydown from FCF is modeled conservatively at 30% sweep.`;

  // Overall verdict
  const hasConsensus = isFinite(dcfMid) || isFinite(lboMid);
  const consensusArr = [dcfMid, lboMid].filter(isFinite);
  const consensusMid = consensusArr.length > 0 ? consensusArr.reduce((a, b) => a + b, 0) / consensusArr.length : NaN;
  const upside = curPrice > 0 && isFinite(consensusMid) ? ((consensusMid - curPrice) / curPrice * 100) : NaN;

  let verdictNote = "";
  if (!hasConsensus || !isFinite(upside)) {
    verdictNote = "Enter company inputs above to generate an overall verdict. This section auto-populates once DCF and LBO outputs are computed.";
  } else if (upside >= 20) {
    verdictNote = `Across methodologies, ${companyName || "the target"} appears undervalued at current price. ` +
      `Consensus mid-point of $${consensusMid.toFixed(2)} implies ~${upside.toFixed(0)}% upside — ` +
      `supportive of a go-forward recommendation pending diligence on revenue quality and capex requirements. ` +
      `Consider sensitivity on WACC and exit multiple before presenting to coverage MD.`;
  } else if (upside >= 0) {
    verdictNote = `Consensus mid of $${consensusMid.toFixed(2)} implies modest upside (~${upside.toFixed(0)}%) relative to current price — ` +
      `broadly in-line with fair value. A deal at or near current trading levels requires operational improvements or synergies to justify IRR targets. ` +
      `Sensitivity analysis recommended before presenting to committee.`;
  } else {
    verdictNote = `Consensus mid of $${consensusMid.toFixed(2)} implies ${Math.abs(upside).toFixed(0)}% downside from current price. ` +
      `The target appears rich on both DCF and LBO methodologies at prevailing multiples. ` +
      `Revisit entry assumptions, synergy case, or walk-away price before advancing in process.`;
  }

  // Editable notes state — inline within component
  const [waccEdit, setWaccEdit] = React.useState("");
  const [tvEdit, setTvEdit] = React.useState("");
  const [lboEdit, setLboEdit] = React.useState("");
  const [verdictEdit, setVerdictEdit] = React.useState("");
  const [editingSection, setEditingSection] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [expanded, setExpanded] = React.useState(true);

  const getNote = (id: string, auto: string, edit: string) => edit.trim() || auto;

  // Notify parent whenever effective notes change (for SendToMD)
  React.useEffect(() => {
    if (onNotesChange) {
      onNotesChange({
        wacc: getNote("wacc", waccNote, waccEdit),
        tv: getNote("tv", tvNote, tvEdit),
        lbo: getNote("lbo", lboNote, lboEdit),
        verdict: getNote("verdict", verdictNote, verdictEdit),
      });
    }
  }, [waccEdit, tvEdit, lboEdit, verdictEdit, waccNote, tvNote, lboNote, verdictNote]);

  const handleCopy = () => {
    const fullText = [
      `=== METHODOLOGY NOTES — ${(companyName || "Target Co.").toUpperCase()} ===`,
      "",
      "WACC & Discount Rate",
      getNote("wacc", waccNote, waccEdit),
      "",
      "Terminal Value Assumptions",
      getNote("tv", tvNote, tvEdit),
      "",
      "LBO Capital Structure",
      getNote("lbo", lboNote, lboEdit),
      "",
      "Overall Verdict",
      getNote("verdict", verdictNote, verdictEdit),
      "",
      "— Generated by DealFlow AI (est.) | Not investment advice",
    ].join("\n");
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sections = [
    {
      id: "wacc",
      title: "WACC & Discount Rate",
      autoNote: waccNote,
      editValue: waccEdit,
      setEdit: setWaccEdit,
      accentClass: "border-l-blue-500",
      dotClass: "bg-blue-500",
    },
    {
      id: "tv",
      title: "Terminal Value Assumptions",
      autoNote: tvNote,
      editValue: tvEdit,
      setEdit: setTvEdit,
      accentClass: "border-l-violet-500",
      dotClass: "bg-violet-500",
    },
    {
      id: "lbo",
      title: "LBO Capital Structure",
      autoNote: lboNote,
      editValue: lboEdit,
      setEdit: setLboEdit,
      accentClass: "border-l-amber-500",
      dotClass: "bg-amber-500",
    },
    {
      id: "verdict",
      title: "Overall Verdict",
      autoNote: verdictNote,
      editValue: verdictEdit,
      setEdit: setVerdictEdit,
      accentClass: "border-l-emerald-500",
      dotClass: "bg-emerald-500",
    },
  ];

  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer select-none border-b"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Methodology Notes</span>
          <span className="text-[10px] text-muted-foreground italic ml-1">
            associate-style annotations — edit or copy for deck
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); handleCopy(); }}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {copied ? <Check size={11} className="text-emerald-500" /> : <RefreshCw size={11} />}
            {copied ? "Copied!" : "Copy for deck"}
          </button>
          {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="divide-y">
          {sections.map(sec => {
            const isEditing = editingSection === sec.id;
            const displayNote = sec.editValue.trim() || sec.autoNote;
            const isCustomized = sec.editValue.trim().length > 0;
            return (
              <div key={sec.id} className={`px-5 py-4 border-l-2 ${sec.accentClass}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sec.dotClass}`} />
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wide">{sec.title}</span>
                    {isCustomized && (
                      <span className="text-[9px] font-medium text-muted-foreground border rounded px-1 py-0.5">edited</span>
                    )}
                  </div>
                  <button
                    onClick={() => setEditingSection(isEditing ? null : sec.id)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-0.5"
                  >
                    {isEditing ? <Check size={10} /> : <Edit3 size={10} />}
                    {isEditing ? "Done" : "Edit"}
                  </button>
                </div>
                {isEditing ? (
                  <textarea
                    className="w-full rounded-md border bg-muted/40 px-3 py-2 text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    rows={4}
                    value={sec.editValue || sec.autoNote}
                    onChange={e => sec.setEdit(e.target.value)}
                    placeholder={sec.autoNote}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground leading-relaxed">{displayNote}</p>
                )}
                {isCustomized && !isEditing && (
                  <button
                    onClick={() => sec.setEdit("")}
                    className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ↺ Reset to auto
                  </button>
                )}
              </div>
            );
          })}
          <div className="px-5 py-2.5 bg-muted/20">
            <p className="text-[10px] text-muted-foreground italic">
              Auto-generated from live inputs. Edit any section to override with your own language before presenting to an MD. <span className="font-medium">Not investment advice.</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Types ────────────────────────────────────────────────────────────────────

interface AssumptionSnapshot {
  id: string;
  label: string;
  savedAt: string; // ISO timestamp
  // company
  companyName: string; revenue: string; ebitdaRaw: string;
  currentPrice: string; sharesOut: string; netDebt: string; taxRate: string;
  // DCF
  revenueGrowth: string; dcfWaccLow: string; dcfWaccHigh: string;
  terminalMultLow: string; terminalMultHigh: string;
  daPercent: string; capexPercent: string; nwcPercent: string;
  // LBO
  entryMult: string; debtMult: string; interestRate: string;
  ebitdaGrowth: string; exitMultLow: string; exitMultHigh: string;
  holdYears: number;
  // Comps
  compsEvLow: string; compsEvHigh: string; precEvLow: string; precEvHigh: string;
}


// ── useScenarios hook — persists to backend when logged in, in-memory fallback ─

interface PersistedScenario extends AssumptionSnapshot {
  serverId?: number;
}

function useScenarios(isLoggedIn: boolean) {
  const [versions, setVersions] = React.useState<PersistedScenario[]>([]);
  const [loading, setLoading] = React.useState(false);

  const authHeader = (): Record<string, string> => {
    const t = getAuthToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  React.useEffect(() => {
    if (!isLoggedIn) return;
    setLoading(true);
    fetch("/api/scenarios", { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then((data: Array<{ id: number; label: string; snapshot: AssumptionSnapshot; updatedAt: number }>) => {
        setVersions(data.map(d => ({
          ...d.snapshot,
          id: String(d.id),
          label: d.label,
          savedAt: new Date(d.updatedAt * 1000).toISOString(),
          serverId: d.id,
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isLoggedIn]);

  const saveVersion = React.useCallback(async (
    label: string,
    snapshot: Omit<AssumptionSnapshot, "id" | "label" | "savedAt">
  ): Promise<void> => {
    if (isLoggedIn) {
      try {
        const res = await fetch("/api/scenarios", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({ label, snapshot }),
        });
        if (res.ok) {
          const data = await res.json();
          const newV: PersistedScenario = {
            ...data.snapshot,
            id: String(data.id),
            label: data.label,
            savedAt: new Date(data.updatedAt * 1000).toISOString(),
            serverId: data.id,
          };
          setVersions(vs => [newV, ...vs]);
          return;
        }
      } catch { /* fall through */ }
    }
    const local: PersistedScenario = {
      ...snapshot,
      id: Date.now().toString(),
      label,
      savedAt: new Date().toISOString(),
    };
    setVersions(vs => [local, ...vs]);
  }, [isLoggedIn]);

  const deleteVersion = React.useCallback(async (id: string): Promise<void> => {
    setVersions(vs => {
      const target = vs.find(v => v.id === id);
      if (isLoggedIn && target?.serverId) {
        fetch(`/api/scenarios/${target.serverId}`, {
          method: "DELETE", headers: authHeader(),
        }).catch(() => {});
      }
      return vs.filter(v => v.id !== id);
    });
  }, [isLoggedIn]);

  const renameVersion = React.useCallback(async (id: string, newLabel: string): Promise<void> => {
    setVersions(vs => {
      const target = vs.find(v => v.id === id);
      if (isLoggedIn && target?.serverId) {
        fetch(`/api/scenarios/${target.serverId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({ label: newLabel }),
        }).catch(() => {});
      }
      return vs.map(v => v.id === id ? { ...v, label: newLabel } : v);
    });
  }, [isLoggedIn]);

  return { versions, loading, saveVersion, deleteVersion, renameVersion };
}

// ── Version History Panel ──────────────────────────────────────────────────

function VersionHistoryPanel({
  versions, activeId, onLoad, onDelete, onSave, onRename,
  loading, isLoggedIn,
}: {
  versions: PersistedScenario[];
  activeId: string | null;
  onLoad: (v: PersistedScenario) => void;
  onDelete: (id: string) => void;
  onSave: (label: string) => void;
  onRename: (id: string, label: string) => void;
  loading: boolean;
  isLoggedIn: boolean;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameVal, setRenameVal] = React.useState("");

  const PRESETS = ["Management Case", "Downside", "Bull Case", "Sponsor Base"];

  const handleSave = () => {
    const label = newLabel.trim() || `Scenario ${versions.length + 1}`;
    onSave(label);
    setNewLabel("");
    setSaving(false);
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className="rounded-xl border bg-card">
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer select-none border-b"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Version History</span>
          {versions.length > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary font-medium px-1.5 py-0.5 rounded-full">
              {versions.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); setSaving(s => !s); }}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <BookmarkPlus size={11} />Save current
          </button>
          {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div>
          {/* Save form */}
          {saving && (
            <div className="px-5 py-3 border-b bg-muted/20">
              <p className="text-xs font-semibold text-foreground mb-2">Name this scenario</p>
              <div className="flex gap-2 mb-2">
                <input
                  className="flex-1 rounded-md border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Management Case"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSave()}
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors"
                >
                  <Check size={11} />Save
                </button>
                <button
                  onClick={() => setSaving(false)}
                  className="rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X size={11} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                  <button
                    key={p}
                    onClick={() => setNewLabel(p)}
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${
                      newLabel === p
                        ? "bg-primary text-primary-foreground border-primary"
                        : "text-muted-foreground hover:text-foreground hover:border-foreground/40"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="px-5 py-6 text-center">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Loading saved scenarios...</p>
            </div>
          ) : versions.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <Clock size={24} className="text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No saved scenarios yet.</p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                Save your current assumptions to compare Management Case vs. Downside, etc.
              </p>
              {!isLoggedIn && (
                <p className="text-[10px] text-amber-500 mt-2 font-medium">
                  Sign in to persist scenarios across sessions.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {versions.map(v => {
                const isActive = v.id === activeId;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                      isActive ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {renamingId === v.id ? (
                          <input
                            className="flex-1 rounded border bg-background px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            value={renameVal}
                            autoFocus
                            onChange={e => setRenameVal(e.target.value)}
                            onBlur={() => { if (renameVal.trim()) onRename(v.id, renameVal.trim()); setRenamingId(null); }}
                            onKeyDown={e => {
                              if (e.key === "Enter") { if (renameVal.trim()) onRename(v.id, renameVal.trim()); setRenamingId(null); }
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                          />
                        ) : (
                          <span
                            className="text-xs font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors"
                            title="Double-click to rename"
                            onDoubleClick={() => { setRenamingId(v.id); setRenameVal(v.label); }}
                          >{v.label}</span>
                        )}
                        {isActive && (
                          <span className="text-[9px] bg-primary/15 text-primary font-medium px-1.5 py-0.5 rounded-full flex-shrink-0">active</span>
                        )}
                        {(v as PersistedScenario).serverId ? (
                          <span className="text-[9px] text-emerald-600 font-medium flex-shrink-0" title="Synced to your account">☁</span>
                        ) : (
                          <span className="text-[9px] text-muted-foreground/40 flex-shrink-0" title="Session only — sign in to persist">◌</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {v.companyName} · WACC {v.dcfWaccLow}–{v.dcfWaccHigh}% · Exit {v.exitMultLow}–{v.exitMultHigh}x · {v.holdYears}yr hold
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">{fmt(v.savedAt)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => onLoad(v)}
                        disabled={isActive}
                        className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                          isActive
                            ? "opacity-40 cursor-default"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        Load
                      </button>
                      <button
                        onClick={() => onDelete(v.id)}
                        className="rounded-md p-1 text-muted-foreground/50 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Send to MD Modal ────────────────────────────────────────────────────────

function SendToMDModal({
  open, onClose,
  companyName, dcfMid, lboMid, lboMidIRR, lboMidMOIC,
  dcfWaccLow, dcfWaccHigh, terminalMultLow, terminalMultHigh,
  exitMultLow, exitMultHigh, holdYears,
  debtMult, interestRate, ebitdaGrowth, ebitdaMarginPct, revenueGrowth,
  curPrice, consensusMid, consensusUpside,
  methodologyNotes,
}: {
  open: boolean; onClose: () => void;
  companyName: string; dcfMid: number; lboMid: number;
  lboMidIRR: number; lboMidMOIC: number;
  dcfWaccLow: string; dcfWaccHigh: string;
  terminalMultLow: string; terminalMultHigh: string;
  exitMultLow: string; exitMultHigh: string;
  holdYears: number; debtMult: string; interestRate: string;
  ebitdaGrowth: string; ebitdaMarginPct: number; revenueGrowth: string;
  curPrice: number; consensusMid: number; consensusUpside: number;
  methodologyNotes: { wacc: string; tv: string; lbo: string; verdict: string };
}) {
  const [to, setTo] = React.useState("");
  const [subject, setSubject] = React.useState(`${companyName || "Target"} — Valuation Football Field Summary`);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  React.useEffect(() => {
    setSubject(`${companyName || "Target"} — Valuation Football Field Summary`);
  }, [companyName]);

  const co = companyName || "Target Co.";
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const dcfStr = isFinite(dcfMid) ? `$${dcfMid.toFixed(2)}` : "N/A";
  const lboStr = isFinite(lboMid) ? `$${lboMid.toFixed(2)}` : "N/A";
  const irrStr = isFinite(lboMidIRR) ? `${lboMidIRR.toFixed(1)}%` : "N/A";
  const moicStr = isFinite(lboMidMOIC) ? `${lboMidMOIC.toFixed(2)}x` : "N/A";
  const consStr = isFinite(consensusMid) ? `$${consensusMid.toFixed(2)}` : "N/A";
  const upStr = isFinite(consensusUpside) ? `${consensusUpside >= 0 ? "+" : ""}${consensusUpside.toFixed(1)}%` : "N/A";
  const marginPct = Math.round(ebitdaMarginPct * 100);

  const body = `Hi [MD Name],

Please find below a summary of the DealFlow Football Field analysis for ${co} as of ${date}.

─────────────────────────────────────────────
VALUATION SUMMARY — ${co.toUpperCase()}
─────────────────────────────────────────────

  DCF Implied Price (mid):       ${dcfStr}
  LBO Implied Price (mid):       ${lboStr}
  LBO IRR (mid):                 ${irrStr}
  LBO MOIC (mid):                ${moicStr}
  Consensus Mid (DCF / LBO avg): ${consStr}
  vs. Current Price:             ${upStr}

─────────────────────────────────────────────
KEY ASSUMPTIONS
─────────────────────────────────────────────

  WACC Range:       ${dcfWaccLow}–${dcfWaccHigh}%
  TV Multiple:      ${terminalMultLow}–${terminalMultHigh}x EV/EBITDA
  Revenue Growth:   ${revenueGrowth}% CAGR
  EBITDA Margin:    ${marginPct}%
  Entry Multiple:   N/A (see LBO model)
  Debt / EBITDA:    ${debtMult}x at ${interestRate}% coupon
  Exit Multiple:    ${exitMultLow}–${exitMultHigh}x
  Hold Period:      ${holdYears} years
  EBITDA Growth:    ${ebitdaGrowth}% CAGR

─────────────────────────────────────────────
METHODOLOGY NOTES
─────────────────────────────────────────────

WACC & Discount Rate:
${methodologyNotes.wacc}

Terminal Value:
${methodologyNotes.tv}

LBO Structure:
${methodologyNotes.lbo}

Overall Verdict:
${methodologyNotes.verdict}

─────────────────────────────────────────────

All figures are estimates. This analysis was generated using DealFlow AI and should be reviewed alongside diligence materials before presenting to committee.

Best,
[Your Name]

───
Generated by DealFlow AI | Not investment advice`;

  const [editedBody, setEditedBody] = React.useState(body);

  React.useEffect(() => {
    if (open) setEditedBody(body);
  }, [open]);

  const openGmailDraft = () => {
    const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(editedBody)}`;
    window.open(gmailUrl, "_blank");
    setSent(true);
    setTimeout(() => { setSent(false); onClose(); }, 1200);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-2xl rounded-2xl border bg-card shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-primary" />
            <span className="font-semibold text-base text-foreground">Send to MD</span>
            <span className="text-[11px] text-muted-foreground italic ml-1">opens a Gmail draft pre-filled with the summary</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Fields */}
        <div className="px-6 py-4 space-y-3 flex-shrink-0 border-b">
          <div className="flex gap-3 items-center">
            <label className="text-xs font-medium text-muted-foreground w-16 flex-shrink-0">To</label>
            <input
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="md.name@firm.com (optional)"
              value={to}
              onChange={e => setTo(e.target.value)}
            />
          </div>
          <div className="flex gap-3 items-center">
            <label className="text-xs font-medium text-muted-foreground w-16 flex-shrink-0">Subject</label>
            <input
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
        </div>

        {/* Body preview */}
        <div className="px-6 py-3 flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Email body — edit before sending</p>
          </div>
          <textarea
            className="flex-1 w-full rounded-md border bg-muted/30 px-3 py-2.5 text-[11px] font-mono text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed min-h-0"
            value={editedBody}
            onChange={e => setEditedBody(e.target.value)}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between flex-shrink-0 bg-muted/10">
          <p className="text-[10px] text-muted-foreground italic">Opens Gmail in a new tab. Your email is never stored.</p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={openGmailDraft}
              className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              {sent ? <Check size={12} /> : <Send size={12} />}
              {sent ? "Opening Gmail..." : "Open in Gmail"}
            </button>
          </div>
        </div>
      </div>
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

  // ── Ticker auto-fill ───────────────────────────────────────────────────────
  const handleTickerFill = useCallback((data: TickerData) => {
    setCompanyName(data.name);
    setRevenue(String(Math.round(data.revenueMM)));
    setEbitdaRaw(String(Math.round(data.ebitdaMM)));
    setCurrentPrice(String(data.price));
    setSharesOut(String(data.sharesMM));
    setNetDebt(String(Math.round(data.netDebtMM)));
    // Seed comps EV range from EV
    if (data.evMM > 0) {
      setCompsEvLow(String(Math.round(data.evMM * 0.9)));
      setCompsEvHigh(String(Math.round(data.evMM * 1.1)));
    }
  }, []);

  // ── Version History (persisted) ──────────────────────────────────────────────
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const {
    versions, loading: versionsLoading,
    saveVersion: saveVersionApi, deleteVersion: deleteVersionApi, renameVersion,
  } = useScenarios(isLoggedIn);

  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);

  const captureSnapshot = (): Omit<AssumptionSnapshot, "id" | "label" | "savedAt"> => ({
    companyName, revenue, ebitdaRaw, currentPrice, sharesOut, netDebt, taxRate,
    revenueGrowth, dcfWaccLow, dcfWaccHigh, terminalMultLow, terminalMultHigh,
    daPercent, capexPercent, nwcPercent,
    entryMult, debtMult, interestRate, ebitdaGrowth, exitMultLow, exitMultHigh, holdYears,
    compsEvLow, compsEvHigh, precEvLow, precEvHigh,
  });

  const saveVersion = useCallback((label: string) => {
    saveVersionApi(label, captureSnapshot());
  }, [saveVersionApi, companyName, revenue, ebitdaRaw, currentPrice, sharesOut, netDebt, taxRate,
      revenueGrowth, dcfWaccLow, dcfWaccHigh, terminalMultLow, terminalMultHigh,
      daPercent, capexPercent, nwcPercent,
      entryMult, debtMult, interestRate, ebitdaGrowth, exitMultLow, exitMultHigh, holdYears,
      compsEvLow, compsEvHigh, precEvLow, precEvHigh]);

  const loadVersion = useCallback((v: PersistedScenario) => {
    setCompanyName(v.companyName); setRevenue(v.revenue); setEbitdaRaw(v.ebitdaRaw);
    setCurrentPrice(v.currentPrice); setSharesOut(v.sharesOut); setNetDebt(v.netDebt);
    setTaxRate(v.taxRate); setRevenueGrowth(v.revenueGrowth);
    setDcfWaccLow(v.dcfWaccLow); setDcfWaccHigh(v.dcfWaccHigh);
    setTerminalMultLow(v.terminalMultLow); setTerminalMultHigh(v.terminalMultHigh);
    setDaPercent(v.daPercent); setCapexPercent(v.capexPercent); setNwcPercent(v.nwcPercent);
    setEntryMult(v.entryMult); setDebtMult(v.debtMult); setInterestRate(v.interestRate);
    setEbitdaGrowth(v.ebitdaGrowth); setExitMultLow(v.exitMultLow); setExitMultHigh(v.exitMultHigh);
    setHoldYears(v.holdYears);
    setCompsEvLow(v.compsEvLow); setCompsEvHigh(v.compsEvHigh);
    setPrecEvLow(v.precEvLow); setPrecEvHigh(v.precEvHigh);
    setActiveVersionId(v.id);
  }, []);

  const deleteVersion = useCallback((id: string) => {
    deleteVersionApi(id);
    setActiveVersionId(prev => prev === id ? null : prev);
  }, [deleteVersionApi]);

  // ── Send to MD ─────────────────────────────────────────────────────────────
  const [sendToMDOpen, setSendToMDOpen] = useState(false);
  const [mdNotes, setMdNotes] = useState({ wacc: "", tv: "", lbo: "", verdict: "" });

  // ── Memo Generator ────────────────────────────────────────────────────────
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoText, setMemoText] = useState("");
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoCopied, setMemoCopied] = useState(false);

  // ── Scenario Toggle ───────────────────────────────────────────────────────
  type ScenarioKey = "bear" | "base" | "bull";
  const [activeScenario, setActiveScenario] = useState<ScenarioKey>("base");

  // ── Excel export ──────────────────────────────────────────────────────────
  const [excelLoading, setExcelLoading] = useState(false);

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

  const dcfBearPrice = dcfBear?.impliedSharePrice ?? NaN;
  const dcfBullPrice = dcfBull?.impliedSharePrice ?? NaN;
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

  // ── Generate Memo ─────────────────────────────────────────────────────────
  const generateMemo = useCallback(async () => {
    if (!user) { alert("Sign in to generate a deal memo."); return; }
    setMemoLoading(true); setMemoText(""); setMemoOpen(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/memo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          companyName, industry: "",
          revenueMM: parseFloat(revenue) || null,
          ebitdaMM: parseFloat(ebitdaRaw) || null,
          evMM: null,
          netDebtMM: parseFloat(netDebt) || null,
          price: parseFloat(currentPrice) || null,
          dcfMid: isFinite(dcfMid) ? dcfMid : null,
          lboMid: isFinite(lboMid) ? lboMid : null,
          lboIRR: isFinite(lboMidIRR) ? lboMidIRR : null,
          lboMOIC: isFinite(lboMidMOIC) ? lboMidMOIC : null,
          consensusMid: isFinite(consensusMid) ? consensusMid : null,
          waccLow: parseFloat(dcfWaccLow) || null,
          waccHigh: parseFloat(dcfWaccHigh) || null,
          tvMultLow: parseFloat(terminalMultLow) || null,
          tvMultHigh: parseFloat(terminalMultHigh) || null,
          exitMultLow: parseFloat(exitMultLow) || null,
          exitMultHigh: parseFloat(exitMultHigh) || null,
          holdYears,
          debtMult: parseFloat(debtMult) || null,
          revenueGrowth: parseFloat(revenueGrowth) || null,
          ebitdaMarginPct,
          methodologyNotes: mdNotes,
        }),
      });
      if (!res.ok) throw new Error("Memo generation failed");
      const data = await res.json();
      setMemoText(data.memo);
    } catch { setMemoText("Failed to generate memo. Please try again."); }
    finally { setMemoLoading(false); }
  }, [user, companyName, revenue, ebitdaRaw, netDebt, currentPrice,
      dcfMid, lboMid, lboMidIRR, lboMidMOIC, consensusMid,
      dcfWaccLow, dcfWaccHigh, terminalMultLow, terminalMultHigh,
      exitMultLow, exitMultHigh, holdYears, debtMult, revenueGrowth,
      ebitdaMarginPct, mdNotes]);

  const downloadExcel = useCallback(async () => {
    setExcelLoading(true);
    try {
      const res = await fetch("/api/export/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          revenueMM: parseFloat(revenue) || null,
          ebitdaMM: parseFloat(ebitdaRaw) || null,
          netDebtMM: parseFloat(netDebt) || null,
          price: parseFloat(currentPrice) || null,
          sharesMM: parseFloat(sharesOut) || null,
          revenueGrowth: parseFloat(revenueGrowth) || null,
          waccLow: parseFloat(dcfWaccLow) || null,
          waccHigh: parseFloat(dcfWaccHigh) || null,
          tvMultLow: parseFloat(terminalMultLow) || null,
          tvMultHigh: parseFloat(terminalMultHigh) || null,
          dcfBear: isFinite(dcfBearPrice) ? dcfBearPrice : null,
          dcfMid: isFinite(dcfMid) ? dcfMid : null,
          dcfBull: isFinite(dcfBullPrice) ? dcfBullPrice : null,
          debtMult: parseFloat(debtMult) || null,
          interestRate: parseFloat(interestRate) || null,
          exitMultLow: parseFloat(exitMultLow) || null,
          exitMultHigh: parseFloat(exitMultHigh) || null,
          holdYears,
          lboIRR: isFinite(lboMidIRR) ? lboMidIRR : null,
          lboMOIC: isFinite(lboMidMOIC) ? lboMidMOIC : null,
          lboBear: isFinite(lboBearPrice) ? lboBearPrice : null,
          lboMid: isFinite(lboMid) ? lboMid : null,
          lboBull: isFinite(lboBullPrice) ? lboBullPrice : null,
        }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DealFlow_${(companyName || "Analysis").replace(/\s+/g,"_")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Excel export failed. Please try again."); }
    finally { setExcelLoading(false); }
  }, [companyName, revenue, ebitdaRaw, netDebt, currentPrice, sharesOut,
      revenueGrowth, dcfWaccLow, dcfWaccHigh, terminalMultLow, terminalMultHigh,
      dcfBearPrice, dcfMid, dcfBullPrice,
      debtMult, interestRate, exitMultLow, exitMultHigh, holdYears,
      lboMidIRR, lboMidMOIC, lboBearPrice, lboMid, lboBullPrice]);

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
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
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
            <span className="text-muted-foreground/40 text-xs">·</span>
            <button
              onClick={generateMemo}
              disabled={memoLoading}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Brain size={12} />{memoLoading ? "Drafting..." : "Draft Memo"}
            </button>
            <button
              onClick={downloadExcel}
              disabled={excelLoading}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <FileDown size={12} />{excelLoading ? "Exporting..." : "Export .xlsx"}
            </button>
            <button
              onClick={() => setSendToMDOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 text-xs font-semibold transition-colors border border-primary/20"
            >
              <Mail size={12} />Send to MD
            </button>
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
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company</p>
                <div className="flex flex-col items-end gap-0.5">
                  <TickerSearch onFill={handleTickerFill} compact />
                  <span className="text-[9px] text-muted-foreground/60">type ticker → Enter to pre-fill</span>
                </div>
              </div>
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
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Implied Share Price Range <span className="normal-case font-normal italic">(est.)</span>
                </p>
                <div className="flex rounded-lg border overflow-hidden text-[11px] font-semibold">
                  {(["bear","base","bull"] as ScenarioKey[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setActiveScenario(s)}
                      className={`px-3 py-1 transition-colors ${
                        activeScenario === s
                          ? s === "bear" ? "bg-red-500 text-white"
                            : s === "bull" ? "bg-emerald-600 text-white"
                            : "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >{s === "base" ? "Base" : s === "bear" ? "Bear" : "Bull"}</button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mb-4">
                Horizontal bars show bear → bull range per methodology. Dashed line = current price.
                {activeScenario !== "base" && (
                  <span className={`ml-2 font-semibold ${activeScenario === "bear" ? "text-red-500" : "text-emerald-600"}`}>
                    Viewing: {activeScenario.toUpperCase()} scenario
                  </span>
                )}
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

            {/* Methodology Notes panel — live associate annotations */}
            <MethodologyNotes
              dcfWaccLow={dcfWaccLow}
              dcfWaccHigh={dcfWaccHigh}
              terminalMultLow={terminalMultLow}
              terminalMultHigh={terminalMultHigh}
              exitMultLow={exitMultLow}
              exitMultHigh={exitMultHigh}
              holdYears={holdYears}
              debtMult={debtMult}
              interestRate={interestRate}
              ebitdaGrowth={ebitdaGrowth}
              ebitdaMarginPct={ebitdaMarginPct}
              revenueGrowth={revenueGrowth}
              lboMidIRR={lboMidIRR}
              dcfMid={dcfMid}
              lboMid={lboMid}
              curPrice={curPrice}
              companyName={companyName}
              onNotesChange={setMdNotes}
            />

            {/* Version History panel */}
            <VersionHistoryPanel
              versions={versions}
              activeId={activeVersionId}
              onLoad={loadVersion}
              onDelete={deleteVersion}
              onSave={saveVersion}
              onRename={renameVersion}
              loading={versionsLoading}
              isLoggedIn={isLoggedIn}
            />
          </div>
        </div>
      </div>

      {/* Deal Memo Modal */}
      {memoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setMemoOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-2xl rounded-2xl border bg-card shadow-2xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
              <div className="flex items-center gap-2">
                <Brain size={16} className="text-primary" />
                <span className="font-semibold text-base">Draft IC Memo</span>
                <span className="text-[11px] text-muted-foreground italic ml-1">associate-style, ready for MD review</span>
              </div>
              <button onClick={() => setMemoOpen(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4 min-h-0">
              {memoLoading ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground">Drafting memo with Claude...</p>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap text-[11px] font-mono text-foreground leading-relaxed">{memoText}</pre>
              )}
            </div>
            {!memoLoading && memoText && (
              <div className="px-6 py-3 border-t flex items-center justify-between bg-muted/10 flex-shrink-0">
                <p className="text-[10px] text-muted-foreground italic">AI-generated first draft. Review before sending. Not investment advice.</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(memoText); setMemoCopied(true); setTimeout(() => setMemoCopied(false), 2000); }}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                >
                  {memoCopied ? <><CheckCircle2 size={11} className="text-emerald-500" />Copied!</> : <><FileText size={11} />Copy memo</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Send to MD modal */}
      <SendToMDModal
        open={sendToMDOpen}
        onClose={() => setSendToMDOpen(false)}
        companyName={companyName}
        dcfMid={dcfMid}
        lboMid={lboMid}
        lboMidIRR={lboMidIRR}
        lboMidMOIC={lboMidMOIC}
        dcfWaccLow={dcfWaccLow}
        dcfWaccHigh={dcfWaccHigh}
        terminalMultLow={terminalMultLow}
        terminalMultHigh={terminalMultHigh}
        exitMultLow={exitMultLow}
        exitMultHigh={exitMultHigh}
        holdYears={holdYears}
        debtMult={debtMult}
        interestRate={interestRate}
        ebitdaGrowth={ebitdaGrowth}
        ebitdaMarginPct={ebitdaMarginPct}
        revenueGrowth={revenueGrowth}
        curPrice={curPrice}
        consensusMid={consensusMid}
        consensusUpside={consensusUpside}
        methodologyNotes={mdNotes}
      />
    </AppLayout>
  );
}
