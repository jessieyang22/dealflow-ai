/**
 * Deal Room — save and organize analyses per named deal
 * Each "deal" is a named workspace that can hold multiple saved analyses
 * (DCF, LBO, Football Field, Accretion, Synergies) plus notes.
 */
import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  FolderOpen, Plus, Trash2, FileText, BarChart2, Calculator,
  ArrowLeftRight, Merge, TrendingUp, Clock, ChevronRight,
  Lock, Pencil, Check, X, BookOpen, ExternalLink, Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DealEntry {
  id: number;
  name: string;
  sector: string;
  status: "Active" | "Closed" | "On Hold" | "Monitoring";
  notes: string;
  createdAt: number;
  updatedAt: number;
  analyses: SavedAnalysis[];
}

interface SavedAnalysis {
  id: number;
  dealId: number;
  type: "DCF" | "LBO" | "Football Field" | "Accretion" | "Synergies" | "Merger Model";
  label: string;
  impliedValue?: string;   // e.g. "$42.10 / share"
  verdict?: string;        // e.g. "Accretive +3.2%"
  createdAt: number;
  snapshot: string;        // JSON
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ANALYSIS_ICONS: Record<string, React.ElementType> = {
  "DCF": BarChart2,
  "LBO": Calculator,
  "Football Field": TrendingUp,
  "Accretion": ArrowLeftRight,
  "Synergies": Merge,
  "Merger Model": FileText,
};

const ANALYSIS_LINKS: Record<string, string> = {
  "DCF": "/dcf",
  "LBO": "/lbo",
  "Football Field": "/football-field",
  "Accretion": "/accretion",
  "Synergies": "/synergies",
  "Merger Model": "/merger-model",
};

const STATUS_COLORS: Record<string, string> = {
  "Active":     "bg-emerald-500/15 text-emerald-400",
  "Closed":     "bg-muted text-muted-foreground",
  "On Hold":    "bg-amber-500/15 text-amber-400",
  "Monitoring": "bg-blue-500/15 text-blue-400",
};

const SECTORS = [
  "Technology", "Healthcare", "Financials", "Consumer", "Industrials",
  "Energy", "Media", "Real Estate", "Telecom", "Other",
];

const STATUSES: Array<DealEntry["status"]> = ["Active", "Closed", "On Hold", "Monitoring"];

// ── Local-storage persistence (no auth required) ──────────────────────────────
function loadDeals(): DealEntry[] {
  try {
    const raw = (window as any).__dealRoomDeals as string | undefined;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveDeals(deals: DealEntry[]) {
  (window as any).__dealRoomDeals = JSON.stringify(deals);
}

let _nextId = Date.now();
function nextId() { return ++_nextId; }

// ── Sub-components ─────────────────────────────────────────────────────────────
function AnalysisChip({ a }: { a: SavedAnalysis }) {
  const Icon = ANALYSIS_ICONS[a.type] ?? FileText;
  const href = ANALYSIS_LINKS[a.type] ?? "/analyze";
  return (
    <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/30 group hover:border-primary/40 transition-colors">
      <Icon size={12} className="text-primary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{a.label}</p>
        {a.impliedValue && (
          <p className="text-[10px] text-muted-foreground truncate">{a.impliedValue}</p>
        )}
      </div>
      <Link href={href}>
        <ExternalLink size={11} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </Link>
    </div>
  );
}

function DealCard({
  deal,
  onDelete,
  onEdit,
  onAddAnalysis,
}: {
  deal: DealEntry;
  onDelete: (id: number) => void;
  onEdit: (id: number, field: string, val: string) => void;
  onAddAnalysis: (dealId: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(deal.name);
  const [expanded, setExpanded] = useState(true);

  const commitName = () => {
    if (editName.trim()) onEdit(deal.id, "name", editName.trim());
    setEditing(false);
  };

  return (
    <div className="border rounded-xl bg-card overflow-hidden" data-testid={`deal-card-${deal.id}`}>
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <FolderOpen size={15} className="text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
              <Input
                className="h-6 text-sm py-0 px-2 w-48"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") commitName(); if (e.key === "Escape") setEditing(false); }}
                autoFocus
              />
              <button onClick={commitName} className="text-emerald-400 hover:text-emerald-300"><Check size={13} /></button>
              <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground"><X size={13} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{deal.name}</span>
              <button
                onClick={e => { e.stopPropagation(); setEditing(true); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
              >
                <Pencil size={11} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground">{deal.sector}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">
              {deal.analyses.length} {deal.analyses.length === 1 ? "analysis" : "analyses"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded", STATUS_COLORS[deal.status])}>
            {deal.status}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onDelete(deal.id); }}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            data-testid={`delete-deal-${deal.id}`}
          >
            <Trash2 size={12} />
          </button>
          <ChevronRight size={13} className={cn("text-muted-foreground transition-transform", expanded && "rotate-90")} />
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 border-t bg-muted/10">
          {/* Status selector */}
          <div className="flex gap-1.5 pt-3 mb-3">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => onEdit(deal.id, "status", s)}
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded transition-colors",
                  deal.status === s ? STATUS_COLORS[s] : "text-muted-foreground bg-muted hover:bg-muted/80"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Notes */}
          <textarea
            className="w-full text-xs bg-background border rounded-md px-3 py-2 resize-none text-muted-foreground focus:text-foreground focus:outline-none focus:border-primary/50 transition-colors"
            rows={2}
            placeholder="Deal notes, thesis, key risks…"
            value={deal.notes}
            onChange={e => onEdit(deal.id, "notes", e.target.value)}
          />

          {/* Saved analyses */}
          {deal.analyses.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              {deal.analyses.map(a => <AnalysisChip key={a.id} a={a} />)}
            </div>
          )}

          {/* Add analysis CTA */}
          <div className="flex flex-wrap gap-2 mt-3">
            {(["DCF", "LBO", "Football Field", "Accretion", "Synergies", "Merger Model"] as const).map(type => {
              const Icon = ANALYSIS_ICONS[type] ?? FileText;
              const href = ANALYSIS_LINKS[type];
              return (
                <Link key={type} href={href}>
                  <button className="inline-flex items-center gap-1 text-[10px] text-muted-foreground border border-dashed rounded px-2 py-1 hover:border-primary/40 hover:text-primary transition-colors">
                    <Icon size={9} />{type}
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── New Deal Modal (inline) ────────────────────────────────────────────────────
function NewDealForm({ onAdd }: { onAdd: (d: DealEntry) => void }) {
  const [name, setName] = useState("");
  const [sector, setSector] = useState("Technology");
  const [open, setOpen] = useState(false);

  const submit = () => {
    if (!name.trim()) return;
    onAdd({
      id: nextId(),
      name: name.trim(),
      sector,
      status: "Active",
      notes: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      analyses: [],
    });
    setName("");
    setOpen(false);
  };

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5 text-xs" data-testid="new-deal-btn">
        <Plus size={13} />New Deal
      </Button>
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-card flex flex-col gap-3">
      <p className="text-xs font-semibold">New Deal</p>
      <Input
        placeholder="Deal name (e.g. Project Atlas)"
        className="h-8 text-sm"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }}
        autoFocus
        data-testid="new-deal-name"
      />
      <select
        className="h-8 text-sm border rounded-md px-2 bg-background"
        value={sector}
        onChange={e => setSector(e.target.value)}
      >
        {SECTORS.map(s => <option key={s}>{s}</option>)}
      </select>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 text-xs" onClick={submit} data-testid="new-deal-submit">Create</Button>
        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DealRoom() {
  const [deals, setDeals] = useState<DealEntry[]>(() => {
    // Pre-seed with a demo deal so the page isn't empty
    return loadDeals().length > 0 ? loadDeals() : [
      {
        id: nextId(),
        name: "Project Atlas",
        sector: "Technology",
        status: "Active",
        notes: "Strategic acquisition target — synergy case being built. Board vote pending.",
        createdAt: Date.now() - 86400 * 3 * 1000,
        updatedAt: Date.now() - 3600 * 1000,
        analyses: [
          { id: nextId(), dealId: 1, type: "DCF", label: "DCF — Base Case", impliedValue: "$42.10 / share", verdict: "", createdAt: Date.now() - 86400 * 2 * 1000, snapshot: "{}" },
          { id: nextId(), dealId: 1, type: "LBO", label: "LBO — 7x Entry", impliedValue: "IRR 22.4% · 3.1x MOIC", verdict: "", createdAt: Date.now() - 86400 * 1 * 1000, snapshot: "{}" },
        ],
      },
      {
        id: nextId(),
        name: "Project Mercury",
        sector: "Healthcare",
        status: "Monitoring",
        notes: "Watching regulatory developments. Revisit after FDA decision.",
        createdAt: Date.now() - 86400 * 7 * 1000,
        updatedAt: Date.now() - 86400 * 2 * 1000,
        analyses: [],
      },
    ];
  });

  const [filter, setFilter] = useState<"All" | DealEntry["status"]>("All");
  const [search, setSearch] = useState("");

  const persist = (next: DealEntry[]) => { setDeals(next); saveDeals(next); };

  const addDeal = (d: DealEntry) => persist([d, ...deals]);

  const deleteDeal = (id: number) => persist(deals.filter(d => d.id !== id));

  const editDeal = (id: number, field: string, val: string) =>
    persist(deals.map(d => d.id === id ? { ...d, [field]: val, updatedAt: Date.now() } : d));

  const visible = deals.filter(d => {
    const matchFilter = filter === "All" || d.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || d.name.toLowerCase().includes(q) || d.sector.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const counts = {
    Active: deals.filter(d => d.status === "Active").length,
    Monitoring: deals.filter(d => d.status === "Monitoring").length,
    "On Hold": deals.filter(d => d.status === "On Hold").length,
    Closed: deals.filter(d => d.status === "Closed").length,
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen size={16} className="text-primary" />
              <h1 className="text-xl font-bold">Deal Room</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Organize analyses by deal — track status, notes, and valuation history.
            </p>
          </div>
          <NewDealForm onAdd={addDeal} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {(["All", "Active", "Monitoring", "On Hold", "Closed"] as const).filter((_, i) => i > 0).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s === filter ? "All" : s)}
              className={cn(
                "border rounded-lg p-3 text-left transition-colors",
                filter === s ? "border-primary/50 bg-primary/5" : "bg-card hover:border-primary/20"
              )}
            >
              <p className="text-lg font-bold">{counts[s as keyof typeof counts]}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s}</p>
            </button>
          ))}
        </div>

        {/* Search */}
        <Input
          className="h-8 text-sm mb-4"
          placeholder="Search deals…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Deal list */}
        {visible.length === 0 ? (
          <div className="border rounded-xl p-10 text-center text-muted-foreground">
            <Archive size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No deals yet</p>
            <p className="text-xs mt-1">Create your first deal to start organizing analyses.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(d => (
              <DealCard
                key={d.id}
                deal={d}
                onDelete={deleteDeal}
                onEdit={editDeal}
                onAddAnalysis={() => {}}
              />
            ))}
          </div>
        )}

        {/* Footer tip */}
        <p className="text-[10px] text-center text-muted-foreground mt-6">
          Deals are saved in your session · Sign in to persist across devices · All values are estimates
        </p>
      </div>
    </AppLayout>
  );
}
