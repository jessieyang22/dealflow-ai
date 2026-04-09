import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { getAuthToken } from "@/lib/auth";
import { API_BASE } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Download, ArrowLeft, TrendingUp, AlertTriangle,
  BarChart3, DollarSign, Building2, Target, CheckCircle2,
} from "lucide-react";
import { Link } from "wouter";

interface DealMemoSection {
  title: string;
  content: string;
  bullets?: string[];
}

interface DealMemo {
  company_name: string;
  ticker: string;
  date: string;
  classification: string;
  ev_range: string;
  recommendation: string;
  executive_summary: string;
  sections: DealMemoSection[];
  financial_highlights: {
    label: string;
    value: string;
    change?: string;
  }[];
  investment_merits: string[];
  key_risks: string[];
  valuation_summary: string;
  synergy_estimate: string;
  analyst_signature: string;
}

function MemoSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      {[1,2,3,4].map(i => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

function PrintableArea({ memo, analysisId }: { memo: DealMemo; analysisId: string }) {
  const recColor = (r: string) => {
    if (r.toLowerCase().includes("buy") || r.toLowerCase().includes("acquire")) return "bg-green-500/10 text-green-700 border-green-500/20";
    if (r.toLowerCase().includes("pass") || r.toLowerCase().includes("avoid")) return "bg-red-500/10 text-red-700 border-red-500/20";
    return "bg-blue-500/10 text-blue-700 border-blue-500/20";
  };

  return (
    <div className="bg-white dark:bg-card border rounded-xl shadow-sm overflow-hidden" id="memo-printable">
      {/* Header Banner */}
      <div className="bg-primary px-8 py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText size={14} className="text-primary-foreground/70" />
              <span className="text-xs text-primary-foreground/70 uppercase tracking-widest font-medium">
                Confidential — Deal Assessment Memorandum
              </span>
            </div>
            <h1 className="text-2xl font-bold text-primary-foreground">
              {memo.company_name}
              {memo.ticker && ` (${memo.ticker})`}
            </h1>
            <p className="text-sm text-primary-foreground/70 mt-0.5">{memo.classification}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-primary-foreground/60 mb-1">{memo.date}</div>
            <Badge variant="outline" className={`text-xs font-bold ${recColor(memo.recommendation)} border`}>
              {memo.recommendation}
            </Badge>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-7">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {memo.financial_highlights?.map((h, i) => (
            <div key={i} className="p-3 rounded-lg bg-muted/40 border">
              <div className="text-xs text-muted-foreground mb-1">{h.label}</div>
              <div className="text-lg font-bold">{h.value}</div>
              {h.change && (
                <div className={`text-xs font-medium ${h.change.startsWith("+") ? "text-green-600" : "text-red-500"}`}>
                  {h.change}
                </div>
              )}
            </div>
          ))}
        </div>

        <Separator />

        {/* Executive Summary */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <Building2 size={12} />Executive Summary
          </h2>
          <p className="text-sm leading-relaxed text-foreground/80">{memo.executive_summary}</p>
        </div>

        {/* Main Sections */}
        {memo.sections?.map((sec, i) => (
          <div key={i}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5 flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                {i + 1}
              </span>
              {sec.title}
            </h2>
            <p className="text-sm leading-relaxed text-foreground/80 mb-2">{sec.content}</p>
            {sec.bullets && sec.bullets.length > 0 && (
              <ul className="space-y-1.5 ml-2">
                {sec.bullets.map((b, j) => (
                  <li key={j} className="text-sm text-foreground/70 flex items-start gap-2">
                    <span className="text-primary mt-0.5 text-xs">▸</span>{b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        <Separator />

        {/* Investment Merits + Risks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3 flex items-center gap-2">
              <CheckCircle2 size={12} />Investment Merits
            </h2>
            <ul className="space-y-2">
              {memo.investment_merits?.map((m, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <TrendingUp size={12} className="text-green-500 mt-0.5 flex-shrink-0" />{m}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-red-500 mb-3 flex items-center gap-2">
              <AlertTriangle size={12} />Key Risk Factors
            </h2>
            <ul className="space-y-2">
              {memo.key_risks?.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <AlertTriangle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />{r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator />

        {/* Valuation + Synergies */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5 flex items-center gap-2">
              <BarChart3 size={12} />Valuation Summary
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed">{memo.valuation_summary}</p>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5 flex items-center gap-2">
              <DollarSign size={12} />Synergy Estimate
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed">{memo.synergy_estimate}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t pt-4 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Prepared by DealFlow AI · For discussion purposes only · Not investment advice
          </div>
          <div className="text-xs font-medium text-foreground/70">{memo.analyst_signature}</div>
        </div>
      </div>
    </div>
  );
}

export default function DealMemo() {
  const { id } = useParams<{ id: string }>();

  const { data: memo, isLoading, error } = useQuery<DealMemo>({
    queryKey: ["/api/analyses", id, "memo"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/analyses/${id}/memo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to generate memo");
      }
      return res.json();
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  function handlePrint() {
    window.print();
  }

  function handleExportPDF() {
    // Trigger the PDF export endpoint if available
    const token = getAuthToken();
    const url = `/api/analyses/${id}/export-pdf`;
    const a = document.createElement("a");
    a.href = token ? `${url}?token=${token}` : url;
    a.download = `DealMemo_${memo?.ticker || id}.pdf`;
    a.click();
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/analyze">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                <ArrowLeft size={13} />Back to Analyzer
              </Button>
            </Link>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <FileText size={14} className="text-primary" />
              <span className="text-sm font-semibold">Deal Assessment Memo</span>
            </div>
          </div>

          {memo && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint} className="text-xs gap-1.5">
                <Download size={12} />Print / Save PDF
              </Button>
            </div>
          )}
        </div>

        {/* Content */}
        {isLoading && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Target size={14} className="animate-pulse text-primary" />
              Generating IB-grade deal memo...
            </div>
            <MemoSkeleton />
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <AlertTriangle size={40} className="text-red-400 mx-auto mb-3" />
            <p className="text-base font-semibold">Memo generation failed</p>
            <p className="text-sm text-muted-foreground mt-1">
              {(error as Error).message}. Make sure you have a valid analysis ID.
            </p>
            <Link href="/analyze">
              <Button className="mt-4">Run New Analysis</Button>
            </Link>
          </div>
        )}

        {memo && !isLoading && (
          <PrintableArea memo={memo} analysisId={id || ""} />
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          header, footer, .no-print { display: none !important; }
          #memo-printable { box-shadow: none !important; border: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </AppLayout>
  );
}
