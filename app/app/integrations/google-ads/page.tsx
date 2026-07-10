import { GoogleAdsWizard } from "./google-ads-wizard";

/**
 * Wizard de conexão Google Ads (ETAPA3GOOGLEADS BLOCO 4). 3 passos: conectar
 * (OAuth) → escolher conta → validar (relatório de teste 7d) + agendar backfill.
 * O estado inicial vem dos searchParams preenchidos pelo callback do OAuth.
 */
export default async function GoogleAdsWizardPage({
  searchParams,
}: {
  searchParams: Promise<{ tokenId?: string; step?: string; error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="space-y-1 text-center">
        <h1 className="font-heading text-4xl font-bold text-primary">Conectar Google Ads</h1>
        <p className="mx-auto max-w-2xl text-lg text-on-surface-variant">
          OAuth por conta — sem colar tokens. Sincronizamos campanhas, grupos de anúncios e anúncios
          no mesmo painel do Meta, comparáveis pelo resultado real.
        </p>
      </div>

      <GoogleAdsWizard
        initialTokenId={sp.tokenId ?? null}
        initialStep={sp.step === "account" ? "account" : undefined}
        oauthError={sp.error ?? null}
      />
    </div>
  );
}
