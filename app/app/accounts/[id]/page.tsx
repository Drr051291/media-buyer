import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { comparePeriods, splitByPeriod, type MetricRow } from "@/lib/engine/period-comparison";
import { formatCurrency, formatPct } from "@/lib/format";
import { DeltaBadge } from "@/components/delta-badge";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const LEVELS = [
  { value: "campaign", label: "Campanhas" },
  { value: "adset", label: "Adsets" },
  { value: "ad", label: "Anúncios" },
] as const;

type EntityLevel = (typeof LEVELS)[number]["value"];

const WINDOW_DAYS = 7;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toMetricRow(row: {
  date: string;
  spend: number | string;
  impressions: number | string;
  clicks: number | string;
  link_clicks: number | string;
  conversions: number | string;
  conversion_value: number | string;
}): MetricRow {
  return {
    date: row.date,
    spend: Number(row.spend),
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    linkClicks: Number(row.link_clicks),
    conversions: Number(row.conversions),
    conversionValue: Number(row.conversion_value),
  };
}

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ level?: string }>;
}) {
  const { id } = await params;
  const { level: levelParam } = await searchParams;
  const level: EntityLevel = LEVELS.some((l) => l.value === levelParam)
    ? (levelParam as EntityLevel)
    : "campaign";

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("ad_accounts")
    .select("id, name, currency, status")
    .eq("id", id)
    .maybeSingle();

  if (!account) notFound();

  const today = new Date();
  const todayIso = isoDate(today);
  const windowStart = new Date(today);
  windowStart.setUTCDate(windowStart.getUTCDate() - (WINDOW_DAYS * 2 - 1));
  const windowStartIso = isoDate(windowStart);

  const [{ data: metricsRows }, { data: entities }] = await Promise.all([
    supabase
      .from("metrics_daily")
      .select("entity_meta_id, date, spend, impressions, clicks, link_clicks, conversions, conversion_value")
      .eq("ad_account_id", id)
      .eq("entity_level", level)
      .eq("breakdown_key", "all")
      .gte("date", windowStartIso)
      .lte("date", todayIso),
    supabase.from("entities").select("meta_id, name, status").eq("ad_account_id", id).eq("level", level),
  ]);

  const nameByMetaId = new Map((entities ?? []).map((e) => [e.meta_id, e.name]));
  const statusByMetaId = new Map((entities ?? []).map((e) => [e.meta_id, e.status]));

  const byEntity = new Map<string, MetricRow[]>();
  const allRows: MetricRow[] = [];
  for (const raw of metricsRows ?? []) {
    const row = toMetricRow(raw);
    allRows.push(row);
    const list = byEntity.get(raw.entity_meta_id) ?? [];
    list.push(row);
    byEntity.set(raw.entity_meta_id, list);
  }

  const accountSplit = splitByPeriod(allRows, todayIso, WINDOW_DAYS);
  const accountComparison = comparePeriods(accountSplit.currentRows, accountSplit.previousRows);

  const entityComparisons = Array.from(byEntity.entries())
    .map(([metaId, rows]) => {
      const { currentRows, previousRows } = splitByPeriod(rows, todayIso, WINDOW_DAYS);
      return {
        metaId,
        name: nameByMetaId.get(metaId) ?? metaId,
        status: statusByMetaId.get(metaId) ?? null,
        comparison: comparePeriods(currentRows, previousRows),
      };
    })
    .sort((a, b) => b.comparison.current.spend - a.comparison.current.spend);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{account.name}</h1>
          <p className="text-sm text-muted-foreground">
            Últimos {WINDOW_DAYS} dias vs {WINDOW_DAYS} dias anteriores
          </p>
        </div>
        <div className="flex gap-4">
          <Link href={`/app/accounts/${id}/insights`} className="text-sm underline underline-offset-4">
            Insights
          </Link>
          <Link href={`/app/accounts/${id}/chat`} className="text-sm underline underline-offset-4">
            Chat
          </Link>
          <Link href={`/app/accounts/${id}/context`} className="text-sm underline underline-offset-4">
            Contexto de negócio
          </Link>
          <Link href={`/app/accounts/${id}/settings`} className="text-sm underline underline-offset-4">
            Configurações
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricTile
          label="Spend"
          value={formatCurrency(accountComparison.current.spend, account.currency)}
          delta={accountComparison.deltaPct.spend}
          higherIsBetter={null}
        />
        <MetricTile
          label="CTR"
          value={formatPct(accountComparison.current.ctr)}
          delta={accountComparison.deltaPct.ctr}
        />
        <MetricTile
          label="CPM"
          value={formatCurrency(accountComparison.current.cpm, account.currency)}
          delta={accountComparison.deltaPct.cpm}
          higherIsBetter={false}
        />
        <MetricTile
          label="CPA"
          value={formatCurrency(accountComparison.current.cpa, account.currency)}
          delta={accountComparison.deltaPct.cpa}
          higherIsBetter={false}
        />
        <MetricTile
          label="ROAS"
          value={accountComparison.current.roas ? `${accountComparison.current.roas.toFixed(2)}x` : "—"}
          delta={accountComparison.deltaPct.roas}
        />
      </div>

      <div className="flex gap-2">
        {LEVELS.map((l) => (
          <Link
            key={l.value}
            href={`/app/accounts/${id}?level=${l.value}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              level === l.value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{LEVELS.find((l) => l.value === level)?.label}</CardTitle>
          <CardDescription>
            {entityComparisons.length === 0
              ? "Sem dados sincronizados ainda para este nível."
              : `${entityComparisons.length} entidade(s) com gasto no período.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entityComparisons.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPM</TableHead>
                  <TableHead className="text-right">CPA</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entityComparisons.map((e) => (
                  <TableRow key={e.metaId}>
                    <TableCell className="max-w-xs truncate">{e.name}</TableCell>
                    <TableCell className="text-right">
                      <div>{formatCurrency(e.comparison.current.spend, account.currency)}</div>
                      <DeltaBadge value={e.comparison.deltaPct.spend} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div>{formatPct(e.comparison.current.ctr)}</div>
                      <DeltaBadge value={e.comparison.deltaPct.ctr} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div>{formatCurrency(e.comparison.current.cpm, account.currency)}</div>
                      <DeltaBadge value={e.comparison.deltaPct.cpm} higherIsBetter={false} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div>{formatCurrency(e.comparison.current.cpa, account.currency)}</div>
                      <DeltaBadge value={e.comparison.deltaPct.cpa} higherIsBetter={false} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div>{e.comparison.current.roas ? `${e.comparison.current.roas.toFixed(2)}x` : "—"}</div>
                      <DeltaBadge value={e.comparison.deltaPct.roas} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricTile({
  label,
  value,
  delta,
  higherIsBetter = true,
}: {
  label: string;
  value: string;
  delta: number | null;
  higherIsBetter?: boolean | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold">{value}</span>
        {higherIsBetter === null ? (
          <span className="text-xs text-muted-foreground">{delta == null ? "—" : `${delta.toFixed(1)}%`}</span>
        ) : (
          <DeltaBadge value={delta} higherIsBetter={higherIsBetter} />
        )}
      </CardContent>
    </Card>
  );
}
