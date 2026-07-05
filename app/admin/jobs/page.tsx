import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUSES = ["pending", "running", "failed", "done"] as const;

export default async function AdminJobsPage() {
  const supabase = await createClient();

  const counts = await Promise.all(
    STATUSES.map((status) =>
      supabase.from("sync_jobs").select("id", { count: "exact", head: true }).eq("status", status),
    ),
  );
  const countsByStatus = Object.fromEntries(STATUSES.map((status, i) => [status, counts[i].count ?? 0]));

  const { data: failedJobs } = await supabase
    .from("sync_jobs")
    .select("id, kind, error, started_at, ad_accounts(name)")
    .eq("status", "failed")
    .order("started_at", { ascending: false })
    .limit(20);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-4xl font-bold text-primary">Jobs</h1>
        <p className="text-sm text-muted-foreground">Fila de sync_jobs (todos os tenants).</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATUSES.map((status) => (
          <Card key={status}>
            <CardContent className="flex flex-col gap-1 pt-6">
              <span className="text-xs text-muted-foreground">{status}</span>
              <span className="font-heading text-2xl font-semibold text-on-surface">{countsByStatus[status]}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Falhas recentes ({(failedJobs ?? []).length})</h2>
        {(failedJobs ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma falha recente.</p>}
        {(failedJobs ?? []).map((job) => {
          const account = Array.isArray(job.ad_accounts) ? job.ad_accounts[0] : job.ad_accounts;
          return (
            <Card key={job.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span>
                    {job.kind} — {account?.name ?? "conta desconhecida"}
                  </span>
                  <Badge variant="destructive">failed</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>{job.error}</span>
                <span>{job.started_at ? new Date(job.started_at).toLocaleString("pt-BR") : "—"}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
