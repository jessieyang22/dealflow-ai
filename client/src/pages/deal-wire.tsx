import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Newspaper, Search, RefreshCw, Clock, ExternalLink,
  TrendingUp, AlertCircle, Radio, ChevronRight, Tag,
  Building2, DollarSign, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DealItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  timestamp: string;        // ISO string
  tags: string[];           // e.g. ["LBO", "Tech", "$4.2B"]
  dealType: "M&A" | "IPO" | "Restructuring" | "Spinoff" | "Other";
  sentiment: "Bullish" | "Neutral" | "Bearish" | "Breaking";
}

// ─── Sentinel deal types ──────────────────────────────────────────────────────
const DEAL_TYPE_COLORS: Record<string, string> = {
  "M&A":           "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "IPO":           "bg-violet-500/15 text-violet-400 border-violet-500/20",
  "Restructuring": "bg-amber-500/15 text-amber-400 border-amber-500/20",
  "Spinoff":       "bg-teal-500/15 text-teal-400 border-teal-500/20",
  "Other":         "bg-muted text-muted-foreground",
};

const SENTIMENT_COLORS: Record<string, string> = {
  "Bullish":  "bg-emerald-500/15 text-emerald-400",
  "Neutral":  "bg-muted text-muted-foreground",
  "Bearish":  "bg-red-500/15 text-red-400",
  "Breaking": "bg-orange-500/15 text-orange-400 animate-pulse",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(iso: string) {
  const delta = (Date.now() - new Date(iso).getTime()) / 1000;
  if (delta < 60)   return `${Math.round(delta)}s ago`;
  if (delta < 3600) return `${Math.round(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.round(delta / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Wire Item Card ───────────────────────────────────────────────────────────
function WireCard({ item }: { item: DealItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className="border rounded-lg p-4 bg-card hover:border-primary/40 transition-colors cursor-pointer group"
      onClick={() => setExpanded(e => !e)}
      data-testid={`wire-item-${item.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Top row: deal type + sentiment + time */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded border",
              DEAL_TYPE_COLORS[item.dealType] ?? DEAL_TYPE_COLORS["Other"]
            )}>{item.dealType}</span>
            <span className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded",
              SENTIMENT_COLORS[item.sentiment] ?? SENTIMENT_COLORS["Neutral"]
            )}>{item.sentiment}</span>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
              <Clock size={9} />
              {relativeTime(item.timestamp)}
            </div>
          </div>

          {/* Headline */}
          <h3 className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors">
            {item.title}
          </h3>

          {/* Tags */}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {item.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  <Tag size={8} />{tag}
                </span>
              ))}
            </div>
          )}

          {/* Expanded summary */}
          {expanded && (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs text-muted-foreground leading-relaxed">{item.summary}</p>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
              >
                Read on {item.source} <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground">{item.source}</span>
          <ChevronRight
            size={13}
            className={cn(
              "text-muted-foreground transition-transform",
              expanded && "rotate-90"
            )}
          />
        </div>
      </div>
    </article>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function WireSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border rounded-lg p-4 bg-card">
          <div className="flex gap-2 mb-2">
            <Skeleton className="h-4 w-12 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
          <Skeleton className="h-4 w-3/4 rounded mb-1" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
}) {
  return (
    <div className="border rounded-lg p-4 bg-card flex items-start gap-3">
      <div className="p-2 rounded-md bg-primary/10">
        <Icon size={14} className="text-primary" />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DealWire() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | "M&A" | "IPO" | "Restructuring" | "Spinoff">("All");
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<{ items: DealItem[]; fetchedAt: string }>({
    queryKey: ["/api/deal-wire", refreshKey],
    queryFn: () => apiRequest("GET", "/api/deal-wire").then(r => r.json()),
    staleTime: 5 * 60 * 1000,   // 5 min
    refetchOnWindowFocus: false,
  });

  const items = data?.items ?? [];

  // client-side filter + search
  const visible = items.filter(item => {
    const matchType = filter === "All" || item.dealType === filter;
    const q = query.toLowerCase();
    const matchQ = !q || item.title.toLowerCase().includes(q)
      || item.tags.some(t => t.toLowerCase().includes(q))
      || item.source.toLowerCase().includes(q);
    return matchType && matchQ;
  });

  // stats
  const totalMA    = items.filter(i => i.dealType === "M&A").length;
  const breaking   = items.filter(i => i.sentiment === "Breaking").length;
  const lastUpdate = dataUpdatedAt ? relativeTime(new Date(dataUpdatedAt).toISOString()) : "—";

  const FILTERS: Array<"All" | "M&A" | "IPO" | "Restructuring" | "Spinoff"> = [
    "All", "M&A", "IPO", "Restructuring", "Spinoff",
  ];

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Radio size={16} className="text-primary animate-pulse" />
              <h1 className="text-xl font-bold">Deal Wire</h1>
              <Badge variant="outline" className="text-[10px] font-medium text-primary border-primary/40">
                LIVE
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Real-time M&A headlines, deal flow, and transaction intelligence.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setRefreshKey(k => k + 1)}
            data-testid="wire-refresh"
          >
            <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard icon={Newspaper}  label="Total Stories"   value={String(items.length)}  sub="this session" />
          <StatCard icon={Building2}  label="M&A Deals"       value={String(totalMA)}        sub="active" />
          <StatCard icon={AlertCircle} label="Breaking"        value={String(breaking)}       sub="stories" />
          <StatCard icon={Clock}      label="Last Updated"    value={lastUpdate}             />
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search headlines, sectors, companies…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              data-testid="wire-search"
            />
          </div>
          <div className="flex gap-1">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors border",
                  filter === f
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                )}
                data-testid={`wire-filter-${f.toLowerCase()}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-4 border rounded-md px-3 py-1.5 bg-muted/30">
          <Globe size={10} />
          <span>Summaries are AI-generated estimates for informational purposes only. Not investment advice.</span>
        </div>

        {/* Feed */}
        {isLoading ? (
          <WireSkeleton />
        ) : isError ? (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            <AlertCircle size={32} className="mx-auto mb-2 text-destructive/50" />
            <p className="text-sm font-medium">Unable to fetch deal wire</p>
            <p className="text-xs mt-1">Check your connection or try refreshing.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            <Newspaper size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No stories match your filter</p>
            <p className="text-xs mt-1">Try adjusting your search or selecting "All".</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(item => (
              <WireCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* Footer hint */}
        {!isLoading && visible.length > 0 && (
          <p className="text-[10px] text-center text-muted-foreground mt-6">
            Showing {visible.length} of {items.length} stories · Click any story to expand · Estimates only
          </p>
        )}
      </div>
    </AppLayout>
  );
}
