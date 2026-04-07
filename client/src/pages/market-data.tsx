import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TrendingUp, TrendingDown, Search, ExternalLink, ArrowRight,
  BarChart3, AlertCircle, Loader2, Activity,
} from "lucide-react";
import { Link } from "wouter";
import AppLayout from "@/components/AppLayout";
import { cn } from "@/lib/utils";

interface MarketData {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  currentPrice: number;
  marketCap: number;
  enterpriseValue: number;
  revenue: number | null;
  ebitda: number | null;
  evEbitda: number | null;
  evRevenue: number | null;
  peRatio: number | null;
  revenueGrowth: number | null;
  grossMargins: number | null;
  ebitdaMargins: number | null;
  week52Low: number | null;
  week52High: number | null;
  currency: string;
  exchange: string;
  description: string;
}

function formatLarge(val: number | null | undefined) {
  if (val == null) return "N/A";
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toFixed(0)}`;
}

function formatPct(val: number | null) {
  if (val == null) return "N/A";
  return `${val > 0 ? "+" : ""}${val.toFixed(1)}%`;
}

function MetricCard({
  label, value, sub, positive,
}: { label: string; value: string; sub?: string; positive?: boolean | null }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn(
        "text-lg font-bold mono",
        positive === true ? "text-emerald-500" :
        positive === false ? "text-red-500" :
        "text-foreground"
      )}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Price Range Bar ────────────────────────────────────────────────────────────
function PriceRangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  const pct = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground mb-2">52-Week Range</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
        <span className="mono">${low.toFixed(2)}</span>
        <div className="flex-1 relative h-2 bg-muted rounded-full">
          <div className="absolute inset-y-0 left-0 bg-primary/40 rounded-full" style={{ width: `${pct}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background shadow"
            style={{ left: `calc(${pct}% - 6px)` }}
          />
        </div>
        <span className="mono">${high.toFixed(2)}</span>
      </div>
      <p className="text-xs text-center text-muted-foreground">Current: <span className="mono font-semibold text-foreground">${current.toFixed(2)}</span></p>
    </div>
  );
}

// ── Analyze Button ────────────────────────────────────────────────────────────
function AnalyzeButton({ data }: { data: MarketData }) {
  const params = new URLSearchParams({
    prefill: "1",
    name: data.name,
    industry: data.industry || data.sector,
    revenue: data.revenue ? data.revenue.toFixed(0) : "",
    ebitda: data.ebitda ? data.ebitda.toFixed(0) : "",
  });
  return (
    <Link href={`/analyze?${params.toString()}`}>
      <Button size="sm" className="gap-1.5" data-testid="market-analyze-btn">
        <BarChart3 size={13} />
        Run M&A Analysis
        <ArrowRight size={12} />
      </Button>
    </Link>
  );
}

// ── Suggested Tickers ─────────────────────────────────────────────────────────
const SUGGESTED = [
  { ticker: "VEEV", desc: "Veeva Systems — SaaS / Life Sciences" },
  { ticker: "MEDP", desc: "Medpace Holdings — Healthcare CRO" },
  { ticker: "ROP", desc: "Roper Technologies — Industrial SaaS" },
  { ticker: "GLOB", desc: "Globant — IT Services" },
  { ticker: "PCOR", desc: "Procore Technologies — Construction SaaS" },
];

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MarketData() {
  const [inputTicker, setInputTicker] = useState("");
  const [activeTicker, setActiveTicker] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery<MarketData>({
    queryKey: ["/api/market", activeTicker],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/market/${activeTicker}`);
      return res.json();
    },
    enabled: !!activeTicker,
    retry: false,
  });

  const handleSearch = () => {
    if (inputTicker.trim()) {
      setActiveTicker(inputTicker.trim().toUpperCase());
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={18} className="text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Live Market Data</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Pull real-time fundamentals for any US-listed company. Pre-populate the M&A analyzer with live data.
          </p>
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-6 max-w-sm">
          <Input
            placeholder="Enter ticker (e.g. VEEV)"
            value={inputTicker}
            onChange={e => setInputTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            className="font-mono uppercase"
            data-testid="market-ticker-input"
          />
          <Button onClick={handleSearch} disabled={!inputTicker || isLoading} size="sm" className="gap-1.5" data-testid="market-search-btn">
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            Search
          </Button>
        </div>

        {/* Suggestions */}
        {!activeTicker && (
          <div className="mb-6">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Try these</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map(({ ticker, desc }) => (
                <button
                  key={ticker}
                  onClick={() => { setInputTicker(ticker); setActiveTicker(ticker); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-card hover:bg-muted transition-colors text-xs font-medium"
                  data-testid={`market-suggest-${ticker}`}
                >
                  <span className="mono font-bold text-primary">{ticker}</span>
                  <span className="text-muted-foreground hidden sm:block">— {desc.split("—")[1]?.trim()}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 py-12 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Fetching market data for {activeTicker}...</span>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center max-w-sm">
            <AlertCircle size={20} className="text-destructive mx-auto mb-2" />
            <p className="text-sm font-medium">Could not find ticker "{activeTicker}"</p>
            <p className="text-xs text-muted-foreground mt-1">Check the ticker symbol and try again.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setActiveTicker(null)}>
              Clear
            </Button>
          </div>
        )}

        {/* Results */}
        {data && !isLoading && (
          <div className="space-y-4" data-testid="market-results">
            {/* Company Header */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold mono bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {data.ticker}
                    </span>
                    <span className="text-xs text-muted-foreground">{data.exchange}</span>
                  </div>
                  <h2 className="text-lg font-bold">{data.name}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {data.sector} {data.industry && `· ${data.industry}`}
                  </p>
                  {data.description && (
                    <p className="text-xs text-muted-foreground mt-2 max-w-xl leading-relaxed">
                      {data.description}...
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-bold mono">
                    ${data.currentPrice?.toFixed(2) || "—"}
                  </p>
                  <AnalyzeButton data={data} />
                </div>
              </div>
            </div>

            {/* 52-Week Range */}
            {data.week52Low && data.week52High && data.currentPrice && (
              <PriceRangeBar low={data.week52Low} high={data.week52High} current={data.currentPrice} />
            )}

            {/* Key Metrics */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Key Metrics</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="Market Cap" value={formatLarge(data.marketCap)} />
                <MetricCard label="Enterprise Value" value={formatLarge(data.enterpriseValue)} />
                <MetricCard
                  label="LTM Revenue" value={data.revenue ? `$${data.revenue.toFixed(0)}M` : "N/A"}
                />
                <MetricCard
                  label="LTM EBITDA" value={data.ebitda ? `$${data.ebitda.toFixed(0)}M` : "N/A"}
                />
              </div>
            </div>

            {/* Valuation Multiples */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Valuation Multiples</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="EV / EBITDA" value={data.evEbitda ? `${data.evEbitda}x` : "N/A"} />
                <MetricCard label="EV / Revenue" value={data.evRevenue ? `${data.evRevenue}x` : "N/A"} />
                <MetricCard label="P/E Ratio" value={data.peRatio ? `${data.peRatio}x` : "N/A"} />
                <MetricCard
                  label="Revenue Growth"
                  value={formatPct(data.revenueGrowth)}
                  positive={data.revenueGrowth != null ? data.revenueGrowth > 0 : null}
                />
              </div>
            </div>

            {/* Margins */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Profitability</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label="Gross Margin"
                  value={formatPct(data.grossMargins)}
                  positive={data.grossMargins != null ? data.grossMargins > 20 : null}
                />
                <MetricCard
                  label="EBITDA Margin"
                  value={formatPct(data.ebitdaMargins)}
                  positive={data.ebitdaMargins != null ? data.ebitdaMargins > 0 : null}
                />
              </div>
            </div>

            {/* CTA */}
            <div className="rounded-xl border bg-card/50 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Ready to run a full M&A assessment?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Financial data pre-populated from market data. Claude AI will generate a deal memo in seconds.
                </p>
              </div>
              <AnalyzeButton data={data} />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
