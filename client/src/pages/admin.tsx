import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getAuthToken } from "@/lib/auth";
import {
  Users, BarChart3, Clock, TrendingUp, Shield, Mail,
  Activity, LayoutDashboard,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Cell,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import { cn } from "@/lib/utils";

interface AdminStats {
  totals: { users: number; analyses: number; waitlist: number; pipeline: number };
  signupsByDay:    { day: string; count: number }[];
  analysesByDay:   { day: string; count: number }[];
  waitlistByDay:   { day: string; count: number }[];
  topUsers:        { email: string; name: string; analyses_run: number; created_at: number }[];
  sectorBreakdown: { sector_mode: string; count: number }[];
  recentUsers:     { email: string; name: string; role: string; analyses_run: number; created_at: number }[];
  recentWaitlist:  { email: string; name: string; role: string; source: string; created_at: number }[];
}

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: any; label: string; value: number | string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon size={14} className={color} />
        </div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className={`text-2xl font-bold mono ${color}`}>{value}</div>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function timeAgo(ts: number) {
  if (!ts) return "—";
  const d = new Date(ts < 1e10 ? ts * 1000 : ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SECTOR_LABELS: Record<string, string> = {
  general: "General", saas: "SaaS", healthcare: "Healthcare",
  industrials: "Industrials", fintech: "FinTech", consumer: "Consumer", energy: "Energy",
};

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

export default function AdminPage() {
  const { user } = useAuth();
  const token = getAuthToken();

  const { data: stats, isLoading, isError } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Forbidden");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 30000, // refresh every 30s
  });

  if (!user) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-center">
          <div>
            <Shield size={32} className="text-muted-foreground mx-auto mb-3" />
            <h2 className="font-semibold mb-1">Admin access required</h2>
            <p className="text-sm text-muted-foreground">Sign in with your admin account to view this page.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
            </div>
            <div className="skeleton h-64 rounded-xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isError || !stats) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-center">
          <div>
            <Shield size={32} className="text-muted-foreground mx-auto mb-3" />
            <h2 className="font-semibold mb-1">Access denied</h2>
            <p className="text-sm text-muted-foreground">Admin privileges required.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const { totals, signupsByDay, analysesByDay, waitlistByDay, topUsers, sectorBreakdown, recentUsers, recentWaitlist } = stats;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-primary" />
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
            <Activity size={10} className="text-emerald-500" />
            Live · refreshes every 30s
          </span>
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={Users}         label="Total Users"    value={totals.users}    color="text-primary" />
          <StatCard icon={Mail}          label="Waitlist"       value={totals.waitlist} color="text-emerald-500"
            sub={totals.waitlist > 0 ? `${totals.waitlist} interested` : "No signups yet"} />
          <StatCard icon={BarChart3}     label="Analyses Run"   value={totals.analyses} color="text-blue-500" />
          <StatCard icon={LayoutDashboard} label="Pipeline Deals" value={totals.pipeline} color="text-amber-500" />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* User Signups */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Users size={14} className="text-primary" />
              <h3 className="text-sm font-semibold">User Signups (30 days)</h3>
            </div>
            {signupsByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={signupsByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", r: 3 }} name="Signups" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
                No signups yet — share the link to get your first users
              </div>
            )}
          </div>

          {/* Analyses Over Time */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={14} className="text-blue-500" />
              <h3 className="text-sm font-semibold">Analyses Run (30 days)</h3>
            </div>
            {analysesByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={analysesByDay} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="Analyses" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
                No analyses yet
              </div>
            )}
          </div>

          {/* Waitlist Growth */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Mail size={14} className="text-emerald-500" />
              <h3 className="text-sm font-semibold">Waitlist Growth (30 days)</h3>
            </div>
            {waitlistByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={waitlistByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
                  <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2}
                    dot={{ fill: "#10b981", r: 3 }} name="Waitlist" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
                No waitlist signups yet
              </div>
            )}
          </div>

          {/* Sector Breakdown */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} className="text-amber-500" />
              <h3 className="text-sm font-semibold">Sector Mode Usage</h3>
            </div>
            {sectorBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={sectorBreakdown.map(s => ({ ...s, label: SECTOR_LABELS[s.sector_mode] || s.sector_mode }))}
                  barSize={24} layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]} name="Analyses">
                    {sectorBreakdown.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
                No data yet
              </div>
            )}
          </div>
        </div>

        {/* Tables Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Signups */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <Users size={13} className="text-primary" />
              <h3 className="text-sm font-semibold">Recent Signups</h3>
              <span className="ml-auto text-xs text-muted-foreground mono">{totals.users} total</span>
            </div>
            {recentUsers.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">No signups yet</div>
            ) : (
              <div className="divide-y">
                {recentUsers.slice(0, 10).map((u, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {(u.name || u.email)[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{u.email}</p>
                        {u.name && <p className="text-xs text-muted-foreground truncate">{u.name}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-right">
                      <span className="text-xs mono text-muted-foreground">{u.analyses_run} runs</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(u.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Waitlist */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <Mail size={13} className="text-emerald-500" />
              <h3 className="text-sm font-semibold">Waitlist</h3>
              <span className="ml-auto text-xs text-muted-foreground mono">{totals.waitlist} total</span>
            </div>
            {recentWaitlist.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                No waitlist signups yet — add the waitlist CTA to your landing page promotion
              </div>
            ) : (
              <div className="divide-y">
                {recentWaitlist.slice(0, 10).map((w, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{w.email}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {w.name && `${w.name} · `}{w.role || "Role not specified"} · {w.source}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(w.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top Users */}
        {topUsers.some(u => u.analyses_run > 0) && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <BarChart3 size={13} className="text-blue-500" />
              <h3 className="text-sm font-semibold">Most Active Users</h3>
            </div>
            <div className="divide-y">
              {topUsers.filter(u => u.analyses_run > 0).slice(0, 5).map((u, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold mono text-muted-foreground w-4">#{i + 1}</span>
                    <div>
                      <p className="text-xs font-medium">{u.name || u.email.split("@")[0]}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(100, (u.analyses_run / (topUsers[0]?.analyses_run || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold mono text-primary w-12 text-right">
                      {u.analyses_run} runs
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
