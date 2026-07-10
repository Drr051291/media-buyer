import Link from "next/link";
import { notFound } from "next/navigation";
import { Monitor, Smartphone, Tablet, Globe, BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getGa4Overview } from "@/lib/db/ga4";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const WINDOW_DAYS = 28;

const DEVICE_ICON: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function int(n: number): string {
  return n.toLocaleString("pt-BR");
}
function pct(n: number | null): string {
  return n == null ? "—" : `${(n * 100).toFixed(1)}%`;
}

/**
 * Painel GA4 no dashboard do cliente (ETAPA2-GA4 BLOCO 7). Lê de
 * ga4_metrics_daily (nunca da API): sessões, conversões, receita, top landing
 * pages, source/medium e o "device que mais converte" — insumo direto para
 * decidir onde alocar budget de mídia.
 */
export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("ad_accounts")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!account) notFound();

  const ga4 = await getGa4Overview(id, WINDOW_DAYS);

  if (!ga4.connected) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-heading text-4xl font-bold text-primary">Analytics (GA4) — {account.name}</h1>
          <p className="text-sm text-on-surface-variant">Cruzamento de dados de comportamento com o gasto de mídia.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
              <BarChart3 className="size-6" />
            </div>
            <div className="space-y-1">
              <p className="font-heading text-lg text-on-surface">Nenhum dado do GA4 ainda</p>
              <p className="max-w-md text-sm text-on-surface-variant">
                Conecte o Google Analytics 4 para o Copiloto cruzar sessões, conversões e receita com o
                gasto da Meta e recomendar onde investir.
              </p>
            </div>
            <Button render={<Link href="/app/integrations/ga4" />}>Conectar Google Analytics</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const t = ga4.totals;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-4xl font-bold text-primary">Analytics (GA4) — {account.name}</h1>
        <p className="text-sm text-on-surface-variant">Últimos {WINDOW_DAYS} dias · fonte: Google Analytics 4</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Sessões" value={int(t.sessions)} />
        <Tile label="Engajamento" value={pct(t.engagementRate)} />
        <Tile label="Conversões" value={int(t.conversions)} />
        <Tile label="Receita" value={brl(t.revenue)} />
        <Tile label="Transações" value={int(t.transactions)} />
      </div>

      {ga4.topConvertingDevice && (
        <Card className="bg-primary-container text-on-primary-container">
          <CardContent className="flex items-center gap-4 pt-6">
            {(() => {
              const Icon = DEVICE_ICON[ga4.topConvertingDevice.key] ?? Globe;
              return <Icon className="size-8 shrink-0" />;
            })()}
            <div>
              <p className="text-sm opacity-90">Device que mais converte</p>
              <p className="font-heading text-xl capitalize">
                {ga4.topConvertingDevice.key} — {int(ga4.topConvertingDevice.conversions)} conversões,{" "}
                {brl(ga4.topConvertingDevice.revenue)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownCard
          title="Por device"
          description="Sessões, conversões e receita por categoria de dispositivo."
          rows={ga4.byDevice}
          firstColLabel="Device"
          capitalizeKey
        />
        <BreakdownCard
          title="Origem / mídia"
          description="De onde vêm as sessões (source / medium do GA4)."
          rows={ga4.bySourceMedium}
          firstColLabel="Source / Medium"
        />
      </div>

      <BreakdownCard
        title="Top landing pages"
        description="Páginas de entrada que mais recebem sessões."
        rows={ga4.byLandingPage}
        firstColLabel="Landing page"
      />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold">{value}</span>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  title,
  description,
  rows,
  firstColLabel,
  capitalizeKey = false,
}: {
  title: string;
  description: string;
  rows: { key: string; sessions: number; conversions: number; revenue: number }[];
  firstColLabel: string;
  capitalizeKey?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Sem dados no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{firstColLabel}</TableHead>
                <TableHead className="text-right">Sessões</TableHead>
                <TableHead className="text-right">Conversões</TableHead>
                <TableHead className="text-right">Receita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className={`max-w-xs truncate ${capitalizeKey ? "capitalize" : ""}`}>{r.key}</TableCell>
                  <TableCell className="text-right">{int(r.sessions)}</TableCell>
                  <TableCell className="text-right">{int(r.conversions)}</TableCell>
                  <TableCell className="text-right">{brl(r.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
