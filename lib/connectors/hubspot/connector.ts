import "server-only";
import type {
  DataConnector,
  ConnectorHealth,
  Credentials,
  ConnectorCategory,
  ConnectorAuthMode,
  Capability,
} from "@/lib/connectors/data-connector";
import { getAccountInfo } from "./client";
import { accessTokenFor, parseCredentials } from "./credentials";

/**
 * Conector HubSpot (ETAPA-HUBSPOT.md). Primeiro conector de CRM da Onda 2.1
 * (ETAPA2.md 2.3). Event-level: produz CanonicalEvent -> business_events
 * (diferente do GA4, que é agregado). A ingestão de verdade vive em
 * lib/connectors/hubspot/sync.ts (poll incremental) e /api/hooks/hubspot
 * (webhook do app público); aqui ficam identidade + validate().
 */
export class HubSpotConnector implements DataConnector {
  id = "hubspot";
  category: ConnectorCategory = "crm";
  authMode: ConnectorAuthMode = "oauth2"; // modo primário; private_app é fallback (credentials.mode)
  capabilities: Capability[] = ["leads", "deals", "meetings"];

  /**
   * `validate` prova o acesso: deriva um access token (renova se OAuth) e
   * consulta a info da conta. Funciona igual para os dois modos de credencial.
   */
  async validate(credentials: Credentials): Promise<ConnectorHealth> {
    const raw = credentials.credentials_json;
    if (!raw) return { isValid: false, message: "Credencial ausente" };
    try {
      const parsed = parseCredentials(raw);
      const accessToken = await accessTokenFor(parsed);
      const account = await getAccountInfo(accessToken);
      return {
        isValid: true,
        message: `Portal ${account.portalId} acessível`,
        scopes: [parsed.mode],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao validar acesso ao HubSpot";
      return { isValid: false, message };
    }
  }
}

export const hubspotConnector = new HubSpotConnector();
