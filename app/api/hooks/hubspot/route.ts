import { NextResponse } from "next/server";
import {
  verifyHubspotV3Signature,
  classifyWebhookEvent,
  type HubspotWebhookEvent,
} from "@/lib/connectors/hubspot/webhook";
import { getHubspotConnectionByPortal } from "@/lib/connectors/hubspot/connection";
import { accessTokenFor, readCredentials } from "@/lib/connectors/hubspot/credentials";
import { getObject, getDealPipelines, batchContactAssociations } from "@/lib/connectors/hubspot/client";
import {
  mapContact,
  mapDeal,
  buildDealStageIndex,
  CONTACT_PROPERTIES,
  DEAL_PROPERTIES,
  type DealStageIndex,
} from "@/lib/connectors/hubspot/map";
import { upsertBusinessEvents } from "@/lib/connectors/hubspot/sync";

/**
 * Webhook do app HubSpot (ETAPA-HUBSPOT.md seção 5). Diferente do webhook
 * genérico (/api/hooks/[connectionId]), o HubSpot tem UM endpoint por app —
 * todo portal que instala o app envia eventos para cá, e o tenant é
 * resolvido por portalId. Assinatura v3 verificada com o HUBSPOT_CLIENT_SECRET.
 *
 * O payload do webhook não traz as propriedades do objeto; para eventos
 * relevantes (criação de contato/deal, mudança de lifecyclestage/dealstage)
 * buscamos o objeto na API e reaproveitamos o MESMO mapeamento do poll —
 * idempotente por external_id, então poll e webhook nunca duplicam.
 */

const MAX_EVENTS_PER_REQUEST = 50; // resposta rápida: o poll diário cobre o resto

export async function POST(request: Request) {
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientSecret) {
    return NextResponse.json({ error: "HubSpot não configurado" }, { status: 503 });
  }

  const rawBody = await request.text();
  const valid = verifyHubspotV3Signature({
    clientSecret,
    method: "POST",
    uri: request.url,
    rawBody,
    timestamp: request.headers.get("x-hubspot-request-timestamp"),
    signature: request.headers.get("x-hubspot-signature-v3"),
  });
  if (!valid) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  let events: HubspotWebhookEvent[];
  try {
    const parsed = JSON.parse(rawBody);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Agrupa por portal: cada portal é uma connection/tenant diferente.
  const byPortal = new Map<string, HubspotWebhookEvent[]>();
  for (const event of events.slice(0, MAX_EVENTS_PER_REQUEST)) {
    if (!event.portalId) continue;
    const key = String(event.portalId);
    byPortal.set(key, [...(byPortal.get(key) ?? []), event]);
  }

  let accepted = 0;
  for (const [portalId, portalEvents] of byPortal) {
    const connection = await getHubspotConnectionByPortal(portalId);
    if (!connection) continue; // portal instalou o app mas não é cliente: ignora

    let accessToken: string;
    try {
      const credentials = await readCredentials(connection.credentials_vault_id);
      accessToken = await accessTokenFor(credentials);
    } catch (error) {
      console.error("[/api/hooks/hubspot] credencial indisponível", { portalId, error });
      continue;
    }

    let stageIndex: DealStageIndex | null = null;
    // Dedup dentro do request: N propertyChange do mesmo objeto = 1 fetch.
    const seen = new Set<string>();

    for (const event of portalEvents) {
      const kind = classifyWebhookEvent(event);
      if (!kind || !event.objectId) continue;
      const dedupKey = `${kind}:${event.objectId}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      try {
        if (kind === "contact") {
          const contact = await getObject(accessToken, "contacts", String(event.objectId), CONTACT_PROPERTIES);
          if (!contact) continue;
          accepted += await upsertBusinessEvents(connection, mapContact(portalId, contact));
        } else {
          const deal = await getObject(accessToken, "deals", String(event.objectId), DEAL_PROPERTIES);
          if (!deal) continue;
          if (!stageIndex) stageIndex = buildDealStageIndex(await getDealPipelines(accessToken));
          const associations = await batchContactAssociations(accessToken, "deals", [deal.id]);
          accepted += await upsertBusinessEvents(
            connection,
            mapDeal(portalId, deal, stageIndex, associations[deal.id] ?? []),
          );
        }
      } catch (error) {
        // Um evento com falha não derruba o batch — o poll diário reconcilia.
        console.error("[/api/hooks/hubspot] falha ao processar evento", {
          portalId,
          objectId: event.objectId,
          subscriptionType: event.subscriptionType,
          error,
        });
      }
    }
  }

  return NextResponse.json({ accepted });
}
