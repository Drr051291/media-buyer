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
        <h1 className="text-2xl font-semibold">Contexto de negócio — {account.name}</h1>
        <p className="text-sm text-muted-foreground">
          É o que diferencia a análise: CPA de R$60 pode ser desastre ou excelente dependendo do
          ticket e da margem desta conta.
        </p>
      </div>
      <BusinessContextForm adAccountId={id} profile={profile} currency={account.currency} />
    </div>
  );
}
