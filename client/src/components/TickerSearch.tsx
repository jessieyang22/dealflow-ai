import React, { useState, useRef, useCallback } from "react";
import { API_BASE } from "@/lib/queryClient";
import { Search, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";

export interface TickerData {
  name: string;
  ticker: string;
  sector: string;
  industry: string;
  revenueMM: number;
  ebitdaMM: number;
  evMM: number;
  netDebtMM: number;
  price: number;
  sharesMM: number;
  peers: Array<{ name: string; ticker: string }>;
}

interface TickerSearchProps {
  onFill: (data: TickerData) => void;
  compact?: boolean;
}

export function TickerSearch({ onFill, compact = false }: TickerSearchProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastFilled, setLastFilled] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTicker = useCallback(async (sym: string) => {
    if (!sym || sym.length < 1) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/ticker/${sym.toUpperCase()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Ticker "${sym}" not found`);
      }
      const data: TickerData = await res.json();
      onFill(data);
      setLastFilled(data.ticker);
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (e: unknown) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to fetch ticker");
      setTimeout(() => setStatus("idle"), 4000);
    }
  }, [onFill]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      fetchTicker(query.trim());
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z.]/g, "");
    setQuery(val);
    if (status !== "idle") setStatus("idle");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length >= 2) {
      debounceRef.current = setTimeout(() => fetchTicker(val), 900);
    }
  };

  const statusIcon = () => {
    if (status === "loading") return <Loader2 size={14} className="animate-spin text-muted-foreground" />;
    if (status === "success") return <CheckCircle2 size={14} className="text-emerald-500" />;
    if (status === "error") return <AlertCircle size={14} className="text-red-500" />;
    return <Search size={14} className="text-muted-foreground" />;
  };

  return (
    <div className={compact ? "flex items-center gap-2" : "w-full"}>
      <div className={`relative flex items-center ${compact ? "w-40" : "w-full"}`}>
        <span className="absolute left-2.5 pointer-events-none">{statusIcon()}</span>
        <input
          className={`w-full rounded-md border bg-background pl-8 pr-8 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary transition-colors uppercase placeholder:normal-case placeholder:font-sans ${
            status === "success" ? "border-emerald-400" :
            status === "error"   ? "border-red-400" :
            "border-input"
          } ${compact ? "py-1.5" : "py-2"}`}
          placeholder="e.g. MSFT, EA, TSLA"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          maxLength={8}
        />
        {query && (
          <button
            className="absolute right-2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => { setQuery(""); setStatus("idle"); }}
          >
            <X size={12} />
          </button>
        )}
      </div>
      {status === "success" && lastFilled && !compact && (
        <p className="text-[10px] text-emerald-600 font-medium mt-1">
          ✓ Pre-filled with {lastFilled} LTM data (est.)
        </p>
      )}
      {status === "error" && !compact && (
        <p className="text-[10px] text-red-500 mt-1">{errorMsg}</p>
      )}
      {compact && status === "success" && (
        <span className="text-[10px] text-emerald-600 font-medium whitespace-nowrap">✓ {lastFilled} filled (est.)</span>
      )}
      {compact && status === "error" && (
        <span className="text-[10px] text-red-500 whitespace-nowrap">{errorMsg}</span>
      )}
    </div>
  );
}
