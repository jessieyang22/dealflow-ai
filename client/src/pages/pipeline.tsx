import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  LayoutDashboard, Plus, Trash2, ChevronRight, Building2,
  AlertCircle, ArrowUpRight, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AppLayout from "@/components/AppLayout";
import { Link } from "wouter";

// ── Constants ─────────────────────────────────────────────────────────────────
const STAGES = ["Screening", "Initial Diligence", "Deep Diligence", "Negotiation", "LOI / Term Sheet", "Closed", "Passed"];
const PRIORITIES = ["High", "Medium", "Low"];

const STAGE_COLORS: Record<string, string> = {
  "Screening": "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700",
  "Initial Diligence": "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700",
  "Deep Diligence": "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-300 dark:border-violet-700",
  "Negotiation": "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700",
  "LOI / Term Sheet": "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-700",
  "Closed": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700",
  "Passed": "bg-red-500/15 text-red-500 dark:text-red-400 border-red-300 dark:border-red-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  "High": "text-red-500",
  "Medium": "text-amber-500",
  "Low": "text-muted-foreground",
};

interface WatchlistItem {
  id: number;
  companyName: string;
  industry: string;
  stage: string;
  priority: string;
  notes?: string;
  analysisId?: number;
  createdAt?: number;
}

// ── Add Deal Modal ─────────────────────────────────────────────────────────────
function AddDealModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ company_name: "", industry: "", stage: "Screening", priority: "Medium", notes: "" });

  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/watchlist", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: "Deal added to pipeline" });
      onClose();
      setForm({ company_name: "", industry: "", stage: "Screening", priority: "Medium", notes: "" });
    },
    onError: () => toast({ title: "Failed to add deal", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Add Deal to Pipeline</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-medium">Company Name</label>
            <Input
              placeholder="e.g. Acme Corp" value={form.company_name}
              onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
              className="mt-1" data-testid="pipeline-input-name"
            />
          </div>
          <div>
            <label className="text-xs font-medium">Industry</label>
            <Input
              placeholder="e.g. SaaS, Healthcare" value={form.industry}
              onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
              className="mt-1" data-testid="pipeline-input-industry"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Stage</label>
              <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Priority</label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Notes <span className="text-muted-foreground">(optional)</span></label>
            <Textarea
              placeholder="e.g. Strong strategic fit, pending management meeting"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3} className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!form.company_name || !form.industry || mutation.isPending}
            onClick={() => mutation.mutate(form)}
            data-testid="pipeline-add-submit"
          >
            {mutation.isPending ? "Adding..." : "Add Deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Deal Card ─────────────────────────────────────────────────────────────────
function DealCard({ item }: { item: WatchlistItem }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [stageVal, setStageVal] = useState(item.stage);
  const [priorityVal, setPriorityVal] = useState(item.priority);
  const [notesVal, setNotesVal] = useState(item.notes || "");

  const updateMutation = useMutation({
    mutationFn: (data: { stage?: string; priority?: string; notes?: string }) =>
      apiRequest("PATCH", `/api/watchlist/${item.id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/watchlist"] }); setEditing(false); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/watchlist/${item.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: `${item.companyName} removed` });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  return (
    <div className="rounded-lg border bg-card p-4 hover:border-border/80 transition-colors" data-testid={`deal-card-${item.id}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Building2 size={13} className="text-muted-foreground flex-shrink-0" />
            <span className="font-semibold text-sm truncate">{item.companyName}</span>
            <span className={`text-xs font-medium ${PRIORITY_COLORS[item.priority] || ""}`}>
              {item.priority === "High" ? "●" : item.priority === "Medium" ? "◐" : "○"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.industry}</p>
        </div>
        <div className="flex items-center gap-1">
          {item.analysisId && (
            <Link href={`/analyze`}>
              <button
                className="p-1 rounded hover:bg-muted transition-colors"
                title="View analysis"
                data-testid={`pipeline-view-${item.id}`}
              >
                <BarChart3 size={12} className="text-primary" />
              </button>
            </Link>
          )}
          <button
            className="p-1 rounded hover:bg-muted transition-colors"
            onClick={() => setEditing(!editing)}
            data-testid={`pipeline-edit-${item.id}`}
          >
            <ChevronRight size={12} className={cn("text-muted-foreground transition-transform", editing && "rotate-90")} />
          </button>
          <button
            className="p-1 rounded hover:bg-destructive/10 transition-colors"
            onClick={() => deleteMutation.mutate()}
            data-testid={`pipeline-delete-${item.id}`}
          >
            <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      </div>

      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded border ${STAGE_COLORS[item.stage] || ""}`}>
        {item.stage}
      </span>

      {item.notes && !editing && (
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-2">{item.notes}</p>
      )}

      {editing && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Stage</label>
              <Select value={stageVal} onValueChange={setStageVal}>
                <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Priority</label>
              <Select value={priorityVal} onValueChange={setPriorityVal}>
                <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea
            value={notesVal}
            onChange={e => setNotesVal(e.target.value)}
            placeholder="Notes..."
            rows={2}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button
              size="sm" className="h-7 text-xs flex-1"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate({ stage: stageVal, priority: priorityVal, notes: notesVal })}
            >
              Save
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pipeline Stats ─────────────────────────────────────────────────────────────
function PipelineStats({ items }: { items: WatchlistItem[] }) {
  const byStage = STAGES.slice(0, 5).map(s => ({
    stage: s,
    count: items.filter(i => i.stage === s).length,
  }));
  const active = items.filter(i => i.stage !== "Closed" && i.stage !== "Passed").length;
  const closed = items.filter(i => i.stage === "Closed").length;
  const passed = items.filter(i => i.stage === "Passed").length;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
      <div className="col-span-1 rounded-lg border bg-card p-3 text-center">
        <div className="text-xl font-bold mono text-primary">{items.length}</div>
        <div className="text-xs text-muted-foreground">Total</div>
      </div>
      <div className="col-span-1 rounded-lg border bg-card p-3 text-center">
        <div className="text-xl font-bold mono text-blue-500">{active}</div>
        <div className="text-xs text-muted-foreground">Active</div>
      </div>
      <div className="col-span-1 rounded-lg border bg-card p-3 text-center">
        <div className="text-xl font-bold mono text-emerald-500">{closed}</div>
        <div className="text-xs text-muted-foreground">Closed</div>
      </div>
      <div className="col-span-1 rounded-lg border bg-card p-3 text-center">
        <div className="text-xl font-bold mono text-red-500">{passed}</div>
        <div className="text-xs text-muted-foreground">Passed</div>
      </div>
      <div className="col-span-1 rounded-lg border bg-card p-3 text-center">
        <div className="text-xl font-bold mono text-amber-500">
          {items.filter(i => i.priority === "High").length}
        </div>
        <div className="text-xs text-muted-foreground">High Priority</div>
      </div>
      <div className="col-span-1 rounded-lg border bg-card p-3 text-center">
        <div className="text-xl font-bold mono">
          {items.filter(i => i.stage === "LOI / Term Sheet").length}
        </div>
        <div className="text-xs text-muted-foreground">At LOI</div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Pipeline() {
  const [addOpen, setAddOpen] = useState(false);
  const [filterStage, setFilterStage] = useState<string>("all");

  const { data: items = [], isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
  });

  const filtered = filterStage === "all" ? items : items.filter(i => i.stage === filterStage);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LayoutDashboard size={18} className="text-primary" />
              <h1 className="text-xl font-bold tracking-tight">Deal Pipeline</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Track M&A targets from initial screen through close.
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)} data-testid="pipeline-add-btn">
            <Plus size={14} />
            Add Deal
          </Button>
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-lg" />)}
          </div>
        ) : items.length === 0 ? (
          <div>
            {/* Example pipeline to show workflow even when empty */}
            <div className="mb-4">
              <p className="text-xs text-muted-foreground italic">Sample pipeline — add your own deals to get started</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Kanban columns */}
              {[
                {
                  stage: "Screening",
                  color: "border-slate-400",
                  deals: [
                    { name: "Project Neptune", industry: "Enterprise SaaS", priority: "High",
                      notes: "$380M ARR, 120% NRR. Strong strategic fit with cloud infra thesis. IOI submitted." },
                    { name: "Project Vega", industry: "HealthTech", priority: "Medium",
                      notes: "EHR integration platform. 3 strategic buyers inbound. Management call scheduled." },
                  ],
                },
                {
                  stage: "Initial Diligence",
                  color: "border-blue-400",
                  deals: [
                    { name: "Project Atlas", industry: "Cybersecurity", priority: "High",
                      notes: "ARR $210M, 85% gross margin. CIM received. Working through data room access." },
                  ],
                },
                {
                  stage: "LOI / Term Sheet",
                  color: "border-orange-400",
                  deals: [
                    { name: "Project Orion", industry: "Fintech Infrastructure", priority: "High",
                      notes: "LOI submitted at 14x EBITDA. Exclusivity through end of month. Final diligence ongoing." },
                  ],
                },
                {
                  stage: "Closed",
                  color: "border-emerald-400",
                  deals: [
                    { name: "Project Mercury", industry: "Supply Chain SaaS", priority: "Medium",
                      notes: "Closed at $1.1B / 11.5x EBITDA. Integration planning underway. 100-day plan live." },
                  ],
                },
              ].map(col => (
                <div key={col.stage} className="space-y-2">
                  <div className={`text-xs font-semibold px-1 pb-2 border-b-2 ${col.color} flex items-center justify-between`}>
                    <span>{col.stage}</span>
                    <span className="text-muted-foreground font-normal">{col.deals.length}</span>
                  </div>
                  {col.deals.map(deal => (
                    <div key={deal.name} className="rounded-lg border bg-card p-3 opacity-80">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Building2 size={12} className="text-muted-foreground" />
                        <span className="text-xs font-semibold">{deal.name}</span>
                        <span className={`text-xs ml-auto ${deal.priority === "High" ? "text-red-500" : "text-amber-500"}`}>
                          {deal.priority === "High" ? "●" : "◐"}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-1.5">{deal.industry}</p>
                      <p className="text-[10px] text-muted-foreground/80 leading-relaxed line-clamp-2">{deal.notes}</p>
                      <span className={`mt-2 inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded border ${STAGE_COLORS[col.stage] || ""}`}>
                        {col.stage}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-2 justify-center">
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus size={13} className="mr-1.5" />Add Your First Deal
              </Button>
              <Link href="/analyze">
                <Button size="sm" variant="outline">
                  <BarChart3 size={13} className="mr-1.5" />Run Analysis
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <PipelineStats items={items} />

            {/* Filter */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                onClick={() => setFilterStage("all")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  filterStage === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                All ({items.length})
              </button>
              {STAGES.map(s => {
                const count = items.filter(i => i.stage === s).length;
                if (count === 0) return null;
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStage(s)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                      filterStage === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {s} ({count})
                  </button>
                );
              })}
            </div>

            {/* Deal Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(item => (
                <DealCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </div>

      <AddDealModal open={addOpen} onClose={() => setAddOpen(false)} />
    </AppLayout>
  );
}
