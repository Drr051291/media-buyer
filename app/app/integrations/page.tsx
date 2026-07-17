import Link from "next/link";
import { BarChart3, Webhook, ArrowRight, Contact } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Marketplace de conexões de dados (ETAPA2 §2.3). GA4 (analytics) e HubSpot
 * (CRM) são os primeiros conectores da Onda 2.1 — cruzam sessões, conversões,
 * leads e negócios com o gasto da Meta para embasar a compra de mídia.
 */
export default async function IntegrationsPage() {
  const supabase = await createClient();
  const [{ data: ga4 }, { data: hubspot }] = await Promise.all([
    supabase
      .from("connections")
      .select("id, status, ga4_property_id, last_sync_at")
      .eq("connector_id", "ga4")
      .maybeSingle(),
    supabase
      .from("connections")
      .select("id, status, hubspot_portal_id, last_sync_at")
      .eq("connector_id", "hubspot")
      .maybeSingle(),
  ]);

  const ga4Connected = Boolean(ga4 && ga4.status === "active" && ga4.ga4_property_id);
  const hubspotConnected = Boolean(
    hubspot && hubspot.status === "active" && hubspot.hubspot_portal_id,
  );

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
          <CardContent className="mt-auto">
            <Button render={<Link href="/app/integrations/ga4" />} className="w-full gap-2">
              {ga4Connected ? "Gerenciar conexão" : "Conectar Google Analytics"}
              <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <div className="mb-2 flex items-start justify-between">
              <div className="flex size-11 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
                <Contact className="size-5" />
              </div>
              <Badge variant={hubspotConnected ? "default" : "secondary"}>
                {hubspotConnected ? "Conectado" : "Disponível"}
              </Badge>
            </div>
            <CardTitle className="text-lg">HubSpot</CardTitle>
            <CardDescription>
              Leads, reuniões e negócios do CRM. Fecha o funil: CAC real, pipeline e receita por
              campanha — não só o CPL do pixel.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button render={<Link href="/app/integrations/hubspot" />} className="w-full gap-2">
              {hubspotConnected ? "Gerenciar conexão" : "Conectar HubSpot"}
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
