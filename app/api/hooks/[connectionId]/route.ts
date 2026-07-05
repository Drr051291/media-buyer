import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { readSecret } from "@/lib/vault";
import { verifyWebhookSignature } from "@/lib/connectors/webhook-signature";
import { WebhookPayloadSchema, toCanonicalEvent } from "@/lib/connectors/webhook-payload";
import { toBusinessEventRow } from "@/lib/connectors/data-connector";

/**
 * Webhook genérico de entrada (ETAPA2.md 2.3/2.4) — escape hatch universal:
 * qualquer sistema (tipicamente via blueprint Make/n8n) que já fale o
 * formato canônico pode postar eventos aqui. Verifica assinatura HMAC,
 * valida o payload, e grava em business_events com idempotência por
 * (connector_id, external_id) — nunca processa atribuição inline, isso é
 * trabalho do attribution_worker (resposta rápida, "enfileira e retorna").
 */
export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const supabase = createServiceRoleClient();

  const { data: connection } = await supabase
    .from("connections")
    .select("id, org_id, ad_account_id, connector_id, status, webhook_secret_vault_id")
    .eq("id", connectionId)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });
  }
  if (connection.status !== "active") {
    return NextResponse.json({ error: "Conexão inativa" }, { status: 403 });
  }
  if (!connection.webhook_secret_vault_id) {
    return NextResponse.json({ error: "Conexão sem segredo de webhook configurado" }, { status: 403 });
  }

  const secret = await readSecret(connection.webhook_secret_vault_id);
  if (!secret) {
    return NextResponse.json({ error: "Segredo do webhook indisponível" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-copiloto-signature");
  if (!verifyWebhookSignature(secret, rawBody, signatureHeader)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsedPayload = WebhookPayloadSchema.safeParse(parsedJson);
  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsedPayload.error.flatten() },
      { status: 400 },
    );
  }

  const events = Array.isArray(parsedPayload.data) ? parsedPayload.data : [parsedPayload.data];

  let rows;
  try {
    rows = events.map((event) =>
      toBusinessEventRow(
        connection.org_id,
        connection.ad_account_id,
        connection.connector_id,
        toCanonicalEvent(event),
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evento inválido";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { error: insertError } = await supabase
    .from("business_events")
    .upsert(rows, { onConflict: "connector_id,external_id", ignoreDuplicates: true });

  if (insertError) {
    return NextResponse.json({ error: "Falha ao gravar eventos" }, { status: 500 });
  }

  await supabase.from("connections").update({ last_sync_at: new Date().toISOString() }).eq("id", connectionId);

  return NextResponse.json({ accepted: rows.length });
}
