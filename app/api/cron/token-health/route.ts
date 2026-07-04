import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { readSecret } from "@/lib/vault";
import { validateToken, hasMinimumScope } from "@/lib/meta/debug-token";

/**
 * Health check diário de todos os tokens Meta (PROJECT.md 5.3, 6.1).
 * Chamado pelo Vercel Cron; protegido por CRON_SECRET.
 *
 * Cada token é revalidado independentemente (Promise.allSettled) para que a
 * falha de um não derrube a checagem dos demais.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: tokens, error } = await supabase
    .from("meta_tokens")
    .select("id, org_id, vault_secret_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = await Promise.allSettled(
    (tokens ?? []).map(async (row) => {
      const secret = await readSecret(row.vault_secret_id);
      if (!secret) {
        await markTokenHealth(row.id, row.org_id, "revoked");
        return { id: row.id, health: "revoked" as const };
      }

      const health = await validateToken(secret);
      const status = !health.isValid
        ? "invalid"
        : !hasMinimumScope(health.scopes)
          ? "invalid"
          : isExpiringSoon(health.expiresAt)
            ? "expiring"
            : "valid";

      await supabase
        .from("meta_tokens")
        .update({
          token_health: status,
          scopes: health.scopes,
          expires_at: health.expiresAt,
          last_validated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (status === "invalid") {
        await supabase
          .from("ad_accounts")
          .update({ status: "disconnected" })
          .eq("meta_token_id", row.id);
      }

      return { id: row.id, health: status };
    }),
  );

  async function markTokenHealth(id: string, orgId: string, health: string) {
    await supabase.from("meta_tokens").update({ token_health: health }).eq("id", id);
    await supabase.from("ad_accounts").update({ status: "disconnected" }).eq("meta_token_id", id);
    await supabase.from("audit_log").insert({
      org_id: orgId,
      event: "meta_token_health_degraded",
      payload: { meta_token_id: id, health },
    });
  }

  return NextResponse.json({
    checked: results.length,
    results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
  });
}

function isExpiringSoon(expiresAt: Date | null): boolean {
  if (!expiresAt) return false; // nunca expira
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return expiresAt.getTime() - Date.now() < sevenDaysMs;
}
