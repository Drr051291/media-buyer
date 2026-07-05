import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_BUSINESS_CONTEXT_PROFILE, type BusinessContextProfile } from "@/lib/engine/business-context";
import { BusinessContextForm } from "./business-context-form";

export default async function BusinessContextPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("ad_accounts")
    .select("id, name, currency")
    .eq("id", id)
    .maybeSingle();

  if (!account) notFound();

  const { data: context } = await supabase
    .from("business_context")
    .select("profile")
    .eq("ad_account_id", id)
    .maybeSingle();

  const profile: BusinessContextProfile = {
    ...EMPTY_BUSINESS_CONTEXT_PROFILE,
    ...((context?.profile as Partial<BusinessContextProfile>) ?? {}),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-5xl font-bold text-primary">Contexto de Negócio</h1>
        <p className="mt-2 max-w-2xl text-lg text-on-surface-variant">
          Configure os pilares fundamentais de {account.name} para que o Copilot ajuste as campanhas ao DNA do
          negócio — CPA de R$60 pode ser desastre ou excelente dependendo do ticket e da margem.
        </p>
        <div className="hand-drawn-divider mt-4" />
      </div>
      <BusinessContextForm adAccountId={id} profile={profile} currency={account.currency} />
    </div>
  );
}
