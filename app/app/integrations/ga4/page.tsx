import { createClient } from "@/lib/supabase/server";
import { Ga4Wizard } from "./ga4-wizard";

/**
 * Wizard de conexão GA4 (ETAPA2-GA4 BLOCO 4). 3 passos: conectar (OAuth) →
 * escolher propriedade → validar (relatório de teste) + agendar backfill. O
 * estado inicial vem dos searchParams preenchidos pelo callback do OAuth.
 */
export default async function Ga4WizardPage({
  searchParams,
}: {
  searchParams: Promise<{ connectionId?: string; step?: string; error?: string; detail?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  // Contas Meta para o vínculo opcional (atribuição cruzada GA4 ↔ Meta).
  const { data: adAccounts } = await supabase
    .from("ad_accounts")
    .select("id, name")
    .eq("status", "active")
    .order("name");

  // Conexão existente (para "gerenciar" e retomar em passo posterior).
  const { data: existing } = await supabase
    .from("connections")
    .select("id, status, ga4_property_id, ga4_property_name")
    .eq("connector_id", "ga4")
    .maybeSingle();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="space-y-1 text-center">
        <h1 className="font-heading text-4xl font-bold text-primary">Conectar Google Analytics 4</h1>
        <p className="mx-auto max-w-2xl text-lg text-on-surface-variant">
          Leitura apenas. Cruzamos suas sessões, conversões e receita com o gasto da Meta para
          recomendar a compra de mídia.
        </p>
      </div>

      <Ga4Wizard
        adAccounts={adAccounts ?? []}
        initialConnectionId={sp.connectionId ?? existing?.id ?? null}
        initialStep={sp.step === "property" ? "property" : undefined}
        oauthError={sp.error ?? null}
        oauthDetail={sp.detail ?? null}
        alreadyConfigured={Boolean(existing?.ga4_property_id)}
        currentPropertyName={existing?.ga4_property_name ?? null}
        currentPropertyId={existing?.ga4_property_id?.replace(/^properties\//, "") ?? null}
      />
    </div>
  );
}
