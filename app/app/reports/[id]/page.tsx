import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReportGenerator } from "./report-generator";

export default async function AccountReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase.from("ad_accounts").select("id, name").eq("id", id).maybeSingle();
  if (!account) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Relatório semanal — {account.name}</h1>
        <p className="text-sm text-muted-foreground">
          Resume os últimos 7 diagnósticos diários em linguagem de negócio, pronto para
          copiar e enviar ao cliente final.
        </p>
      </div>
      <ReportGenerator adAccountId={id} />
    </div>
  );
}
