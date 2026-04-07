import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, TrendingUp, Building2, DollarSign, Calendar } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const SECTORS = ["All", "SaaS", "Healthcare", "Industrials", "FinTech", "Consumer", "Energy"];
const DEAL_TYPES = ["All", "Strategic", "Financial Sponsor", "Both"];

function formatEV(ev: number) {
  if (ev >= 1000) return `$${(ev / 1000).toFixed(1)}B`;
  return `$${ev}M`;
}

function PremiumBadge({ premium }: { premium: number }) {
  if (!premium) return <span className="text-muted-foreground">—</span>;
  const color = premium >= 40 ? "text-green-600 bg-green-50 dark:bg-green-900/20" :
                premium >= 20 ? "text-blue-600 bg-blue-50 dark:bg-blue-900/20" :
                "text-orange-600 bg-orange-50 dark:bg-orange-900/20";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${color}`}>
      +{premium}%
    </span>
  );
}

function MultipleBadge({ value, label }: { value: number | null; label: string }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="text-xs font-mono">
      {value.toFixed(1)}x
      <span className="text-muted-foreground ml-1">{label}</span>
    </span>
  );
}

export default function PrecedentsPage() {
  const [sector, setSector] = useState("All");
  const [dealType, setDealType] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"ev" | "year" | "premium" | "evRevenue" | "evEbitda">("year");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (sector !== "All") params.set("sector", sector);
  if (dealType !== "All") params.set("deal_type", dealType);
  if (search) params.set("search", search);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/precedents", sector, dealType, search],
    queryFn: () => apiRequest("GET", `/api/precedents?${params.toString()}`).then((r: any) => r.json()),
  });

  const transactions: any[] = data?.transactions || [];

  // Client-side sort
  const sorted = [...transactions].sort((a, b) => {
    const va = a[sortBy] ?? 0;
    const vb = b[sortBy] ?? 0;
    return sortDir === "desc" ? vb - va : va - vb;
  });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const SortBtn = ({ col, label }: { col: typeof sortBy; label: string }) => (
    <button
      className={`text-xs font-medium ${sortBy === col ? "text-primary" : "text-muted-foreground"} hover:text-foreground`}
      onClick={() => toggleSort(col)}
    >
      {label}{sortBy === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </button>
  );

  // Stats
  const medianEvEbitda = transactions.filter(t => t.evEbitda).map(t => t.evEbitda).sort((a,b)=>a-b);
  const midIdx = Math.floor(medianEvEbitda.length / 2);
  const median = medianEvEbitda.length > 0 ? medianEvEbitda[midIdx].toFixed(1) : "—";
  const avgPremium = transactions.length > 0
    ? Math.round(transactions.filter(t => t.premium).reduce((a, t) => a + t.premium, 0) / transactions.filter(t=>t.premium).length)
    : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Precedent Transactions</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {transactions.length} curated M&amp;A transactions across 6 sectors. Real deals, IB-accurate multiples and premiums.
        </p>
      </div>

      {/* Stats row */}
      {transactions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Deals", value: transactions.length.toString(), icon: <Building2 className="w-3.5 h-3.5" /> },
            { label: "Median EV/EBITDA", value: `${median}x`, icon: <DollarSign className="w-3.5 h-3.5" /> },
            { label: "Avg Control Premium", value: avgPremium ? `${avgPremium}%` : "—", icon: <TrendingUp className="w-3.5 h-3.5" /> },
            { label: "Date Range", value: "2011–2024", icon: <Calendar className="w-3.5 h-3.5" /> },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                {s.icon}
                <span className="text-xs">{s.label}</span>
              </div>
              <div className="text-lg font-bold text-foreground">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search target, acquirer, or industry…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              className="text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={sector}
              onChange={e => setSector(e.target.value)}
            >
              {SECTORS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <select
            className="text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            value={dealType}
            onChange={e => setDealType(e.target.value)}
          >
            {DEAL_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Target</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Acquirer</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Sector</th>
                <th className="text-right px-4 py-3"><SortBtn col="year" label="Year" /></th>
                <th className="text-right px-4 py-3"><SortBtn col="ev" label="EV" /></th>
                <th className="text-right px-4 py-3"><SortBtn col="evRevenue" label="EV/Rev" /></th>
                <th className="text-right px-4 py-3"><SortBtn col="evEbitda" label="EV/EBITDA" /></th>
                <th className="text-right px-4 py-3"><SortBtn col="premium" label="Premium" /></th>
                <th className="text-center px-4 py-3 text-muted-foreground font-medium text-xs">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-muted/50 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                    No transactions match your filters
                  </td>
                </tr>
              ) : (
                sorted.map((tx) => (
                  <tr
                    key={tx.id}
                    className={`hover:bg-muted/30 cursor-pointer transition-colors ${selected?.id === tx.id ? "bg-primary/5" : ""}`}
                    onClick={() => setSelected(selected?.id === tx.id ? null : tx)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{tx.target}</div>
                      <div className="text-xs text-muted-foreground">{tx.industry}</div>
                    </td>
                    <td className="px-4 py-3 text-foreground">{tx.acquirer}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {tx.sector}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{tx.year}</td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">{formatEV(tx.ev)}</td>
                    <td className="px-4 py-3 text-right">
                      <MultipleBadge value={tx.evRevenue} label="EV/Rev" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MultipleBadge value={tx.evEbitda} label="EV/EBITDA" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PremiumBadge premium={tx.premium} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs ${
                        tx.dealType === "Strategic"
                          ? "text-blue-600"
                          : tx.dealType === "Financial Sponsor"
                          ? "text-purple-600"
                          : "text-orange-600"
                      }`}>
                        {tx.dealType === "Financial Sponsor" ? "PE/Sponsor" : tx.dealType}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="mt-4 bg-card border border-primary/30 rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-bold text-foreground text-base">{selected.target}</h3>
              <p className="text-sm text-muted-foreground">{selected.acquirer} · {selected.year} · {selected.status}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-lg">×</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {[
              { label: "Enterprise Value", value: formatEV(selected.ev) },
              { label: "LTM Revenue", value: selected.revenue ? formatEV(selected.revenue) : "—" },
              { label: "LTM EBITDA", value: selected.ebitda > 0 ? formatEV(selected.ebitda) : (selected.ebitda < 0 ? `(${formatEV(Math.abs(selected.ebitda))})` : "—") },
              { label: "Control Premium", value: selected.premium ? `${selected.premium}%` : "—" },
              { label: "EV/Revenue", value: selected.evRevenue ? `${selected.evRevenue.toFixed(1)}x` : "—" },
              { label: "EV/EBITDA", value: selected.evEbitda ? `${selected.evEbitda.toFixed(1)}x` : "—" },
              { label: "Sector", value: selected.sector },
              { label: "Deal Type", value: selected.dealType },
            ].map(f => (
              <div key={f.label}>
                <div className="text-xs text-muted-foreground mb-0.5">{f.label}</div>
                <div className="font-semibold text-foreground">{f.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            <strong>{selected.industry}</strong> — Click any row to view transaction details. Use these multiples as valuation benchmarks in your deal analyses.
          </div>
        </div>
      )}

      {/* Methodology note */}
      <div className="mt-6 text-xs text-muted-foreground text-center">
        Transaction data sourced from public filings, press releases, and industry databases. EV/EBITDA multiples reflect LTM figures at announcement.
        For research purposes only — not a fairness opinion or investment advice.
      </div>
    </div>
  );
}
