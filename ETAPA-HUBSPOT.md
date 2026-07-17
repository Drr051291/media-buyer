# ETAPA HUBSPOT — Conector de CRM (Onda 2.1 da Etapa 2)

> **Complemento do ETAPA2.md.** Esta etapa entrega o primeiro conector de CRM
> da camada de integrações: **HubSpot**. Leads, reuniões e negócios do CRM
> entram no modelo canônico (`business_events`) e alimentam a cascata de
> atribuição — fechando o funil anúncio → lead → reunião → venda.
>
> Nota: o ETAPA2.md listava HubSpot como "API key" na Onda 2.2. O HubSpot
> aposentou API keys em 2022; esta etapa antecipa o conector usando os dois
> caminhos atuais (OAuth de app público + token de Private App) e o promove
> para a Onda 2.1, ao lado do GA4.

---

## 1. O que esta etapa entrega

- **Conexão em dois modos**, atrás do mesmo `HubSpotConnector implements DataConnector`:
  - **OAuth 2.0 (app público, caminho principal)** — o cliente clica em
    "Conectar HubSpot", faz login, autoriza escopos read-only e pronto. Não
    exige listagem no marketplace nem review do HubSpot.
  - **Token de Private App (fallback BYOT)** — o cliente cola o token gerado
    no próprio portal (mesma filosofia do System User da Meta). Para quem não
    pode autorizar OAuth no portal do cliente final.
- **Sync incremental retomável** (poll da Search API por `hs_lastmodifieddate`,
  1 página por objeto por invocação, cursor em `connections.sync_cursor`),
  com **backfill de 180 dias** usando o mesmo mecanismo.
- **Webhook near-real-time** (`/api/hooks/hubspot`): eventos de criação de
  contato/negócio e mudanças de `lifecyclestage`/`dealstage` chegam em
  segundos, com verificação da assinatura v3 e idempotência total contra o poll.
- **Mapeamento canônico** (puro e testado): contato → `lead_created`/
  `lead_qualified`; reunião → `meeting_scheduled`/`meeting_held`; negócio →
  `deal_created`/`deal_won`/`deal_lost` (com `monetary_value` = amount).
- **Atribuição**: hints extraídos de `hs_analytics_first_url` (fbclid/UTMs) +
  propriedades customizadas do snippet de captura; identidade por
  `email_hash`/`phone_hash` (LGPD: nunca PII bruta) + `external_contact_id`
  para o nível 3 da cascata (lead entra com UTM, vira venda 30 dias depois).
- **Wizard UI** em `/app/integrations/hubspot` + card no marketplace de
  integrações.

### Arquivos principais

```
lib/connectors/hubspot/
  oauth.ts        # authorize URL, troca de code, refresh (access token ~30min)
  credentials.ts  # JSON {mode: oauth|private_app} no Vault
  client.ts       # fetch com retry/backoff 429/5xx, Search API, pipelines, associações
  map.ts          # HubSpot -> CanonicalEvent (puro, testado)
  webhook.ts      # assinatura v3 + classificação de eventos (puro, testado)
  sync.ts         # poll incremental fatiado/retomável + orquestrador p/ cron
  connection.ts   # leitura de connections (por id, org e portal)
  connector.ts    # HubSpotConnector implements DataConnector
app/api/connectors/hubspot/{oauth/start,oauth/callback,connect,confirm}/route.ts
app/api/hooks/hubspot/route.ts
app/app/integrations/hubspot/{page.tsx,hubspot-wizard.tsx}
supabase/migrations/0013_hubspot_connector.sql
tests/connectors/hubspot-map.test.ts
```

---

## 2. Decisões de arquitetura

| Decisão | Racional |
|---|---|
| App público **não listado** no marketplace | Funciona para qualquer portal sem review do HubSpot (diferente da Meta, onde o App Review nos empurrou para BYOT) |
| Só o **refresh token** persiste (Vault) | Access token do HubSpot expira em ~30 min; é derivado sob demanda, nunca gravado |
| Private App token como **fallback**, não caminho principal | Exige super admin no portal e não recebe webhooks (webhook é do app público); OAuth tem UX melhor |
| Backfill = mesmo mecanismo do incremental | Cursor `since_ms` começa 180d atrás e avança; sem máquina de backfill separada (mais simples que o GA4, que precisa de janelas de datas) |
| `external_id` por **fase** (`hs:{portal}:deal:{id}:won`) | O poll vê estado, não transição; a fase no id garante que cada marco é emitido 1x (UNIQUE connector_id+external_id) e que poll e webhook nunca duplicam |
| Webhook busca o objeto na API e reusa o mapeamento do poll | O payload do webhook não traz propriedades; um único caminho de mapeamento = um único lugar para bugs |
| Portal → tenant é **1:1** (índice único em `hubspot_portal_id`) | O webhook chega num endpoint único por app; o `portalId` do corpo resolve o tenant sem ambiguidade |
| Search API com `GTE` + upsert idempotente | Absorve sobreposição de timestamps e o cap de 10k resultados/query (o cursor avança em vez de paginar uma query gigante) |
| Rate limits respeitados no client | ~110 req/10s por portal; Search API ~4 req/s — 1 página por objeto por invocação fica muito abaixo disso |

---

## 3. O QUE VOCÊ PRECISA FAZER MANUALMENTE

### Passo 1 — Rodar a migration

No SQL Editor do Supabase (ou `supabase db push`), rode:

```
supabase/migrations/0013_hubspot_connector.sql
```

(Adiciona `connections.hubspot_portal_id` + índice único. `business_events` já existe desde a 0010.)

### Passo 2 — Criar o app público no HubSpot (uma vez, da plataforma)

1. Crie uma **conta de desenvolvedor** (gratuita) em
   [developers.hubspot.com](https://developers.hubspot.com) → *Create a developer account*.
2. Dentro dela: **Apps → Create app**.
   - Aba **App Info**: nome (ex: "Copiloto de Tráfego"), logo, descrição.
   - Aba **Auth**:
     - Copie o **Client ID** e o **Client Secret**.
     - Em **Redirect URLs**, adicione (byte a byte):
       - produção: `https://SEU-DOMINIO.vercel.app/api/connectors/hubspot/oauth/callback`
       - dev local: `http://localhost:3000/api/connectors/hubspot/oauth/callback`
     - Em **Scopes**, adicione EXATAMENTE (mismatch derruba a autorização):
       - `crm.objects.contacts.read`
       - `crm.objects.deals.read`
       - `crm.objects.companies.read`
       - `crm.schemas.deals.read`
       - (`oauth` já vem incluído por padrão)
3. **Não precisa** submeter para o marketplace nem pedir review — apps não
   listados funcionam para qualquer portal que autorize.

### Passo 3 — Configurar webhooks do app (recomendado, opcional)

Na mesma tela do app: **Webhooks**:

1. **Target URL**: `https://SEU-DOMINIO.vercel.app/api/hooks/hubspot`
2. Crie as **subscriptions**:
   - `contact.creation`
   - `contact.propertyChange` → propriedade `lifecyclestage`
   - `deal.creation`
   - `deal.propertyChange` → propriedade `dealstage`
3. Ative as subscriptions (ficam "paused" até ativar).

> Sem webhook o conector continua funcionando — o poll diário do cron cobre
> tudo; o webhook só reduz a latência de horas para segundos. O webhook exige
> URL pública (não funciona em localhost sem túnel).

### Passo 4 — Variáveis de ambiente

No `.env.local` (dev) e no projeto Vercel (produção):

```bash
HUBSPOT_CLIENT_ID=          # do Passo 2
HUBSPOT_CLIENT_SECRET=      # do Passo 2 (também valida a assinatura dos webhooks)
HUBSPOT_OAUTH_REDIRECT_URI=https://SEU-DOMINIO.vercel.app/api/connectors/hubspot/oauth/callback
```

Faça **redeploy** na Vercel depois de salvar.

### Passo 5 — Conectar (o que o SEU CLIENTE faz)

**Caminho A — OAuth (padrão):** `/app/integrations` → card **HubSpot** →
"Conectar HubSpot" → login no HubSpot → escolher o portal → autorizar →
validar → confirmar. Fim.

**Caminho B — Private App (fallback):** no wizard, clicar em *"Não consigo
autorizar? Cole um token de Private App"*. No HubSpot do cliente:
**Configurações (engrenagem) → Integrações → Private Apps → Create private app**
→ aba Scopes: marcar `crm.objects.contacts.read`, `crm.objects.deals.read`,
`crm.objects.companies.read` (Read only) → Create → copiar o token
(`pat-na1-...`) → colar no wizard. Exige super admin no portal.

### Passo 6 — (Opcional, melhora a atribuição para nível 1)

Para atribuição por **click ID exato**, o site do cliente precisa capturar o
`fbclid` e gravá-lo em propriedades customizadas do contato via campos ocultos
de formulário (`fbclid`, `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content`, `utm_term`) — ver `docs/tracking-snippet.md`. Sem isso, a
atribuição usa a primeira URL vista pelo HubSpot (`hs_analytics_first_url`) e
identidade por e-mail — níveis 2/3 da cascata, que já funcionam.

---

## 4. Como o sync funciona (referência rápida)

```
Cursor (connections.sync_cursor):
{ "hubspot": {
    "last_run_date": "YYYY-MM-DD",          // rodada diária concluída
    "objects": {
      "contacts": { "since_ms": 0, "after": "..."? },  // after = paginação pendente
      "deals":    { "since_ms": 0 },
      "meetings": { "since_ms": 0 } } } }
```

- **Confirmar no wizard** → `initHubspotSync` (cursores em `now - 180d`) +
  primeira fatia síncrona.
- **Worker diário** (`/api/cron/sync`, já agendado no `vercel.json`) →
  `processNextHubspotSlice()`: prioriza conexões com `after` pendente
  (backfill em andamento), pula quem já concluiu a rodada do dia. Cada fatia =
  1 página (100 registros) por objeto + associações + pipelines.
- **Webhook** → mapeia e grava direto; o poll reconcilia qualquer perda.

## 5. Verificação pós-deploy (checklist)

1. Conectar um portal de teste (HubSpot oferece test accounts na conta de dev).
2. `select count(*), event_type from business_events where connector_id='hubspot' group by 2;`
   → deve mostrar `lead_created`/`deal_created` após a confirmação do wizard.
3. Criar um contato de teste no HubSpot → com webhook ativo, a linha aparece
   em segundos; sem webhook, após o próximo cron.
4. `select sync_cursor from connections where connector_id='hubspot';` → o
   `since_ms` deve avançar a cada rodada; `after` some quando o backfill termina.
5. Audit log: eventos `hubspot_connected` / `hubspot_confirmed`.

## 6. Fora do escopo desta etapa (próximas)

- Métricas de funil fechado no dashboard (CAC real / pipeline por campanha
  lado a lado com o CPL da Meta) — próximo item da Onda 2.1, consome
  `business_events` + `attributions` que este conector alimenta.
- `attribution_worker` agendado ligando eventos HubSpot às entidades Meta
  (a cascata `lib/attribution/cascade.ts` já existe; falta o worker).
- Painel "Verdade das Conversões" e auditor de UTM.
- Health check diário da credencial HubSpot no `token_health` (hoje a falha
  aparece no primeiro sync).
