import { createClient } from "@/lib/supabase/server";
import { HubspotWizard } from "./hubspot-wizard";

/**
 * Wizard de conexão HubSpot (ETAPA-HUBSPOT.md seção 6). 2 passos: conectar
 * (OAuth ou token de Private App) → validar (teste de acesso) + iniciar o
 * backfill de 180d. O estado inicial vem dos searchParams preenchidos pelo
 * callback do OAuth.
 */
export default async function HubspotWizardPage({
  searchParams,
}: {
  searchParams: Promise<{ connectionId?: string; step?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  // Contas Meta para o vínculo opcional (atribuição cruzada CRM ↔ Meta).
  const { data: adAccounts } = await supabase
    .from("ad_accounts")
    .select("id, name")
    .eq("status", "active")
    .order("name");

  // Conexão existente (para "gerenciar" e retomar em passo posterior).
  const { data: existing } = await supabase
    .from("connections")
    .select("id, status, hubspot_portal_id")
    .eq("connector_id", "hubspot")
    .maybeSingle();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="space-y-1 text-center">
        <h1 className="font-heading text-4xl font-bold text-primary">Conectar HubSpot</h1>
        <p className="mx-auto max-w-2xl text-lg text-on-surface-variant">
          Leitura apenas. Cruzamos seus leads, reuniões e negócios com o gasto da Meta para
          mostrar o CAC e o pipeline REAIS por campanha — não só o CPL do pixel.
        </p>
      </div>

      <HubspotWizard
        adAccounts={adAccounts ?? []}
        initialConnectionId={sp.connectionId ?? existing?.id ?? null}
        initialStep={sp.step === "validate" ? "validate" : undefined}
        oauthError={sp.error ?? null}
        alreadyConfigured={Boolean(existing?.hubspot_portal_id && existing.status === "active")}
      />
    </div>
  );
}
