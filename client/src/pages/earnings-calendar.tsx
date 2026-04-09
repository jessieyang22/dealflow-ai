/**
 * Earnings Calendar — upcoming earnings dates + estimate tracker
 * Pulls live data from yfinance backend endpoint
 */
import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  CalendarDays, Search, TrendingUp, TrendingDown, Minus,
  Plus, X, Clock, AlertCircle, RefreshCw, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface EarningsEntry {
  symbol: string;
  name: string;
  earningsDate: string;    // ISO
  daysUntil: number;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  epsSurprisePct: number | null;
  revSurprisePct: number | null;
  sector: string;
  marketCap: string;
  beat: boolean | null;    // null = upcoming
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (n: number | null) => n == null ? "—" : n >= 1e9 ? `$${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(0)}M` : `$${n.toFixed(2)}`;
const fmtEPS = (n: number | null) => n == null ? "—" : `$${n.toFixed(2)}`;
const surprise = (pct: number | null) => {
  if (pct == null) return null;
  const pos = pct > 0;
  return (
    <span className={cn("text-[10px] font-medium", pos ? "text-emerald-400" : "text-red-400")}>
      {pos ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
};

function daysLabel(d: number) {
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 0)  return `${Math.abs(d)}d ago`;
  return `in ${d}d`;
}

// ── Default watchlist ─────────────────────────────────────────────────────────
const DEFAULT_TICKERS = [
  "AAPL","MSFT","GOOGL","META","AMZN","NVDA","JPM","GS","MS","BAC",
  "WBD","PARA","DIS","NFLX","T","VZ",
];

// ── Row component ─────────────────────────────────────────────────────────────
function EarningsRow({ e }: { e: EarningsEntry }) {
  const upcoming = e.beat === null;
  const beat = e.beat === true;
  const miss = e.beat === false;

  return (
    <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors text-xs">
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-primary">{e.symbol}</span>
          <span className="text-muted-foreground hidden sm:block truncate max-w-[120px]">{e.name}</span>
        </div>
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-1.5">
          {upcoming ? (
            <span className="text-xs font-medium">{daysLabel(e.daysUntil)}</span>
          ) : (
            <span className="text-muted-foreground">{new Date(e.earningsDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          )}
          {upcoming && e.daysUntil <= 3 && e.daysUntil >= 0 && (
            <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium">Soon</span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3 text-right">
        <div>
          <span>{fmtEPS(e.epsActual ?? e.epsEstimate)}</span>
          {e.epsEstimate != null && e.epsActual == null && (
            <p className="text-[9px] text-muted-foreground">est.</p>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3 text-right">
        {surprise(e.epsSurprisePct) ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td className="py-2.5 px-3 text-right hidden md:table-cell">
        {fmt$(e.revenueActual ?? e.revenueEstimate)}
        {e.revenueEstimate != null && e.revenueActual == null && (
          <span className="text-[9px] text-muted-foreground ml-1">est.</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right hidden md:table-cell">
        {surprise(e.revSurprisePct) ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td className="py-2.5 px-3 text-right">
        {upcoming ? (
          <span className="text-[10px] text-muted-foreground">Pending</span>
        ) : beat ? (
          <span className="flex items-center justify-end gap-1 text-emerald-400"><TrendingUp size={11} />Beat</span>
        ) : miss ? (
          <span className="flex items-center justify-end gap-1 text-red-400"><TrendingDown size={11} />Miss</span>
        ) : (
          <span className="flex items-center justify-end gap-1 text-muted-foreground"><Minus size={11} />In Line</span>
        )}
      </td>
    </tr>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border/50">
      {[1,2,3,4,5,6,7].map(i => (
        <td key={i} className="py-2.5 px-3"><Skeleton className="h-3 w-full rounded" /></td>
      ))}
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EarningsCalendar() {
  const [tickers, setTickers] = useState<string[]>(DEFAULT_TICKERS);
  const [addInput, setAddInput] = useState("");
  const [filter, setFilter] = useState<"all" | "upcoming" | "recent">("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, isError } = useQuery<{ entries: EarningsEntry[] }>({
    queryKey: ["/api/earnings", tickers.join(","), refreshKey],
    queryFn: () => apiRequest("POST", "/api/earnings", { tickers }).then(r => r.json()),
    staleTime: 0,           // always fetch fresh on mount
    gcTime: 5 * 60 * 1000, // keep in cache 5 min
    enabled: true,
    refetchOnWindowFocus: false,
  });

  const entries = data?.entries ?? [];

  const visible = entries.filter(e => {
    if (filter === "upcoming") return e.beat === null;
    if (filter === "recent")   return e.beat !== null;
    return true;
  });

  const addTicker = () => {
    const sym = addInput.trim().toUpperCase();
    if (sym && !tickers.includes(sym)) {
      setTickers(t => [...t, sym]);
    }
    setAddInput("");
  };

  const removeTicker = (sym: string) => setTickers(t => t.filter(x => x !== sym));

  const beatsCount  = entries.filter(e => e.beat === true).length;
  const missesCount = entries.filter(e => e.beat === false).length;
  const upcomingCount = entries.filter(e => e.beat === null).length;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays size={16} className="text-primary" />
              <h1 className="text-xl font-bold">Earnings Calendar</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Upcoming earnings dates, EPS & revenue estimates vs. actuals.{" "}
              <span className="text-[11px] italic">Estimates from analyst consensus — may vary.</span>
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs"
            onClick={() => setRefreshKey(k => k + 1)}>
            <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border rounded-lg p-3 bg-card">
            <p className="text-lg font-bold text-amber-400">{upcomingCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Upcoming</p>
          </div>
          <div className="border rounded-lg p-3 bg-card">
            <p className="text-lg font-bold text-emerald-400">{beatsCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Beats</p>
          </div>
          <div className="border rounded-lg p-3 bg-card">
            <p className="text-lg font-bold text-red-400">{missesCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Misses</p>
          </div>
        </div>

        {/* Watchlist management */}
        <div className="border rounded-lg p-3 bg-card mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Star size={12} className="text-primary" />
            <span className="text-xs font-medium">Watchlist</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tickers.map(sym => (
              <span key={sym} className="inline-flex items-center gap-1 text-[11px] bg-muted px-2 py-0.5 rounded font-mono">
                {sym}
                <button onClick={() => removeTicker(sym)} className="text-muted-foreground hover:text-destructive">
                  <X size={9} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              className="h-7 text-xs w-32"
              placeholder="Add ticker…"
              value={addInput}
              onChange={e => setAddInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && addTicker()}
            />
            <Button size="sm" variant="outline" className="h-7 text-xs px-2 gap-1" onClick={addTicker}>
              <Plus size={11} />Add
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 mb-4">
          {(["all", "upcoming", "recent"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-[11px] font-medium px-3 py-1.5 rounded-md border transition-colors capitalize",
                filter === f ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground border-border hover:border-primary/40"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="border rounded-xl bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="text-left py-2.5 px-3">Ticker</th>
                <th className="text-left py-2.5 px-3">Date</th>
                <th className="text-right py-2.5 px-3">EPS</th>
                <th className="text-right py-2.5 px-3">EPS Δ</th>
                <th className="text-right py-2.5 px-3 hidden md:table-cell">Revenue</th>
                <th className="text-right py-2.5 px-3 hidden md:table-cell">Rev Δ</th>
                <th className="text-right py-2.5 px-3">Result</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : isError ? (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  <AlertCircle size={20} className="mx-auto mb-2 text-destructive/50" />
                  Unable to load earnings data — try refreshing.
                </td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No entries match your filter.
                </td></tr>
              ) : (
                visible.map(e => <EarningsRow key={`${e.symbol}-${e.earningsDate}`} e={e} />)
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-center text-muted-foreground mt-4">
          Data sourced from yfinance · Estimates are analyst consensus · All values are estimates · Not investment advice
        </p>
      </div>
    </AppLayout>
  );
}
