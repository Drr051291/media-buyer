import Link from "next/link";
import { BarChart3, Webhook, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Marketplace de conexões de dados (ETAPA2 §2.3). GA4 é o primeiro conector da
 * Onda 2.1 — traz sessões, conversões, receita, landing page e device que
 * converte para cruzar com o gasto da Meta e embasar a compra de mídia.
 */
export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: ga4 } = await supabase
    .from("connections")
    .select("id, status, ga4_property_id, ga4_property_name, last_sync_at")
    .eq("connector_id", "ga4")
    .maybeSingle();

  const ga4Connected = Boolean(ga4 && ga4.status === "active" && ga4.ga4_property_id);
  // 'properties/123456' -> '123456' para mostrar o id enxuto ao lado do nome.
  const ga4PropertyNumericId = ga4?.ga4_property_id?.replace(/^properties\//, "") ?? null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="font-heading text-4xl font-bold text-primary">Integrações de dados</h1>
        <p className="max-w-2xl text-lg text-on-surface-variant">
          Conecte suas fontes de verdade do negócio. O Copiloto cruza esses dados com o gasto de
          mídia para recomendar onde investir — não só CPA genérico do Ads Manager.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <div className="mb-2 flex items-start justify-between">
              <div className="flex size-11 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
                <BarChart3 className="size-5" />
              </div>
              <Badge variant={ga4Connected ? "default" : "secondary"}>
                {ga4Connected ? "Conectado" : "Disponível"}
              </Badge>
            </div>
            <CardTitle className="text-lg">Google Analytics 4</CardTitle>
            <CardDescription>
              Sessões, conversões, receita, landing pages e device que converte. Alimenta a
              atribuição por session stitching.
            </CardDescription>
          </CardHeader>
          {ga4Connected && (
            <CardContent className="pb-4">
              <div className="rounded-lg border border-outline-variant/50 bg-surface-bright p-3">
                <p className="text-xs font-medium text-on-surface-variant">Propriedade conectada</p>
                <p className="truncate font-medium text-on-surface" title={ga4?.ga4_property_name ?? undefined}>
                  {ga4?.ga4_property_name ?? "Propriedade GA4"}
                </p>
                {ga4PropertyNumericId && (
                  <p className="mt-0.5 font-mono text-xs text-on-surface-variant">
                    ID: {ga4PropertyNumericId}
                  </p>
                )}
              </div>
            </CardContent>
          )}
          <CardContent className="mt-auto">
            <Button render={<Link href="/app/integrations/ga4" />} className="w-full gap-2">
              {ga4Connected ? "Gerenciar conexão" : "Conectar Google Analytics"}
              <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col opacity-80">
          <CardHeader>
            <div className="mb-2 flex items-start justify-between">
              <div className="flex size-11 items-center justify-center rounded-lg bg-surface-variant text-on-surface-variant">
                <Webhook className="size-5" />
              </div>
              <Badge variant="secondary">Webhook</Badge>
            </div>
            <CardTitle className="text-lg">Webhook genérico</CardTitle>
            <CardDescription>
              Qualquer sistema (CRM, e-commerce, ERP) que fale o formato canônico pode postar
              eventos — tipicamente via um blueprint no Make/n8n.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button variant="outline" className="w-full" disabled>
              Configurado por conexão
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
