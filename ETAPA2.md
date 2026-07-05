# ETAPA 2 — Integrações & Inteligência de Funil Fechado

> **Complemento do PROJETO.md.** Este documento especifica a evolução do produto de "copiloto de Meta Ads" para **gestor de mídia completo**: uma camada de integrações (CRM, ERP, e-commerce, GA4 e outras plataformas) e um motor de atribuição que cruza anúncio → lead → reunião → venda → estoque → margem. A Etapa 1 (PROJETO.md) continua sendo o núcleo; nada aqui a substitui — esta etapa **enriquece o Account Snapshot e os sinais** com dados de negócio reais.

---

## 1. A tese da Etapa 2

O gestor de tráfego comum otimiza para o que o pixel enxerga: CPA e ROAS reportados pela Meta. O problema é que a Meta só sabe o que acontece até o evento de conversão rastreado. Ela não sabe:

- que 40% dos leads da Campanha A eram desqualificados e os da Campanha B fecharam contrato;
- que o produto mais vendido pelo anúncio X está com 3 unidades em estoque;
- que o ticket médio REAL dos compradores vindos do adset Y é 2× o da média;
- que o lead vira reunião em 4 dias e venda em 30 — então o "CPA de ontem" não diz nada.

**A Etapa 2 fecha esse loop.** O sistema deixa de perguntar "qual anúncio tem o menor CPA?" e passa a responder **"qual anúncio gera mais lucro/pipeline por real investido?"** — e a agir sobre isso. Este é o fosso competitivo: a Meta nunca terá o CRM e o ERP do cliente; o nosso agente terá.

**Métrica-norte da etapa:** toda conta conectada com ≥1 integração de destino (CRM/e-commerce/ERP) deve exibir **ROAS real** (receita/lucro do sistema de destino ÷ spend) lado a lado com o ROAS da Meta, por campanha/adset/anúncio.

---

## 2. Arquitetura da Camada de Integrações

### 2.1 Princípio: conectores plugáveis sobre um modelo canônico

Mesma filosofia do `AdsProvider` da Etapa 1: cada plataforma externa implementa uma interface `DataConnector`, e TUDO que entra é normalizado para um **modelo canônico de eventos de negócio** antes de tocar o motor de inteligência. O motor nunca conhece "Pipedrive" ou "Shopify" — conhece `lead`, `deal`, `meeting`, `order`, `refund`, `inventory_level`.

```typescript
// lib/connectors/data-connector.ts
interface DataConnector {
  id: string;                            // 'pipedrive', 'shopify', 'ga4'...
  category: 'crm' | 'ecommerce' | 'erp' | 'analytics' | 'payments' | 'custom';
  authMode: 'api_key' | 'oauth2' | 'webhook_only';
  validate(credentials: Credentials): Promise<ConnectorHealth>;
  // Ingestão: pelo menos um dos dois
  pull?(cursor: SyncCursor): Promise<{events: CanonicalEvent[], nextCursor: SyncCursor}>;
  handleWebhook?(payload: unknown): CanonicalEvent[];
  // Capacidades declaradas (o motor se adapta ao que existe)
  capabilities: Capability[];  // 'leads' | 'deals' | 'meetings' | 'orders' | 'refunds'
                               // | 'inventory' | 'products' | 'sessions' | 'ltv'
}
```

### 2.2 Modelo canônico de eventos (`business_events`)

Uma única tabela de fatos, append-only, para todos os conectores:

```sql
business_events (
  id, ad_account_id, org_id,
  connector_id,                 -- de onde veio
  external_id,                  -- id no sistema de origem (dedup)
  event_type,                   -- lead_created | lead_qualified | lead_disqualified
                                -- | meeting_scheduled | meeting_held
                                -- | deal_created | deal_stage_changed | deal_won | deal_lost
                                -- | order_created | order_paid | order_refunded
                                -- | subscription_started | subscription_churned
  occurred_at timestamptz,
  monetary_value numeric,       -- valor do pedido/deal (se houver)
  cost_value numeric,           -- custo do produto (ERP) → habilita LUCRO
  currency,
  contact_ref jsonb,            -- {email_hash, phone_hash, external_contact_id}
  attribution_hints jsonb,      -- {fbclid, gclid, utm_source, utm_medium, utm_campaign,
                                --  utm_content, utm_term, landing_page, referrer,
                                --  meta_ad_id?, ga4_session_id?}
  items jsonb,                  -- [{sku, qty, price}] p/ pedidos
  raw jsonb,                    -- payload original (auditoria/debug)
  created_at
)
-- índices: (ad_account_id, occurred_at), (external_id, connector_id) UNIQUE,
--          GIN em attribution_hints
```

Tabelas de dimensão complementares:
```sql
contacts (id, org_id, email_hash, phone_hash, external_ids jsonb, first_seen_at,
          first_touch_ref jsonb, ltv_cached numeric)     -- identidade unificada
products (id, org_id, connector_id, sku, name, price, cost, stock_qty,
          stock_updated_at)                              -- de e-commerce/ERP
connections (id, org_id, ad_account_id?, connector_id, credentials_vault_id,
             status, capabilities text[], last_sync_at, sync_cursor jsonb)
```

### 2.3 Conectores da V2 (priorização para mercado BR)

| Onda | Categoria | Conectores | Modo | O que traz |
|---|---|---|---|---|
| **2.1** | Analytics | **GA4** (Data API) | OAuth2 | sessões, conversões, funil no site, source/medium por campanha — a "cola" universal |
| **2.1** | CRM | **Pipedrive**, **RD Station CRM** | API key/OAuth | leads, etapas do funil, reuniões, deals ganhos/perdidos, motivos de perda |
| **2.1** | E-commerce | **Shopify**, **Nuvemshop**, **WooCommerce** | OAuth/API key + webhooks | pedidos, valor, itens, cliente, reembolsos |
| **2.2** | ERP | **Bling**, **Tiny**, **Odoo** | API key/OAuth | custo do produto (→ lucro real), estoque, pedidos de outros canais |
| **2.2** | CRM long-tail BR | **DataCrazy**, HubSpot, Kommo | API key | idem CRM |
| **2.2** | Pagamentos/assinatura | Stripe, Hotmart, Kiwify | webhook | vendas de infoproduto, churn, LTV |
| **2.3** | Escape hatch universal | **Webhook genérico de entrada** + **conector Make/n8n** (blueprint pronto) | webhook | qualquer sistema que o cliente tenha — ele mapeia os campos no nosso wizard |
| **2.3** | Planilha | Google Sheets (import agendado) | OAuth | operações que vivem em planilha (comum em PME/leadgen) |

> **Nota estratégica:** o webhook genérico + blueprint Make/n8n resolve 100% do long-tail sem construirmos 50 conectores. O wizard de mapeamento ("qual campo é o e-mail? qual é o valor? qual é a etapa?") transforma qualquer POST em `business_events`.

### 2.4 Ingestão: webhooks primeiro, polling como fallback

- **Webhooks** sempre que a plataforma oferecer (Shopify, Nuvemshop, Pipedrive, Stripe): endpoint `/api/hooks/{connection_id}` com verificação de assinatura, idempotência por `external_id`, resposta rápida (enfileira e retorna 200).
- **Polling incremental** (Vercel Cron, jobs fatiados como na Seção 3.2 do PROJETO.md) para GA4, ERPs e APIs sem webhook: cursor por `updated_at`, janelas pequenas, retomável.
- **Backfill** de 90–180 dias no onboarding do conector (async, chunked) — necessário para a atribuição ter histórico desde o dia 1.
- Toda credencial no **Supabase Vault**, mesma disciplina dos tokens Meta.

---

## 3. Motor de Atribuição (o cruzamento anúncio ↔ resultado)

Coração da etapa. Objetivo: para cada `business_event`, determinar **de qual anúncio/adset/campanha ele veio** — e com que confiança.

### 3.1 Cascata de matching (determinístico → probabilístico)

Executada por job (`attribution_worker`) sobre eventos novos, gravando em `attributions`:

| Nível | Método | Confiança | Como funciona |
|---|---|---|---|
| 1 | **Click ID direto** (`fbclid` capturado na LP e propagado ao CRM/checkout) | `exact` | fbclid → mapeado ao ad via metadados de clique armazenados (a Etapa 2 inclui um **snippet JS de captura** + campos ocultos de formulário que o cliente instala; para quem já tem GTM server-side, doc de setup) |
| 2 | **UTM completo** (`utm_campaign/utm_content/utm_term` = ids ou nomes das entidades) | `high` | exige **convenção de nomenclatura de UTM** que o próprio sistema gera e valida (ver 3.3) |
| 3 | **Identidade + janela** (email/phone hash do evento bate com lead/pedido que TEM utm/fbclid em touch anterior) | `high` | resolve o caso clássico: lead entra com UTM, vira venda no CRM 30 dias depois sem UTM — o `contacts` liga as pontas |
| 4 | **GA4 session stitching** | `medium` | evento sem hints, mas GA4 tem sessão do mesmo client_id com source=facebook/cpc e campanha X na janela |
| 5 | **Probabilístico por janela** (último recurso, sinalizado) | `low` | conversão sem nenhum rastro, distribuída proporcionalmente ao share de cliques das campanhas ativas na janela — NUNCA usada para ação automática, só para relatório com disclaimer |

```sql
attributions (
  business_event_id, entity_level, entity_meta_id,  -- ad/adset/campaign
  method,            -- click_id | utm | identity_window | ga4 | probabilistic
  confidence,        -- exact | high | medium | low
  touch_occurred_at, lag_days,                       -- tempo clique→evento
  model              -- 'last_click' na V2; arquitetura pronta p/ multi-touch
)
```

**Regra de ouro (herdada da Etapa 1):** o LLM nunca faz matching. A cascata é código determinístico e testável; o LLM recebe o resultado já consolidado.

### 3.2 Métricas de funil fechado (novas colunas do Metric Engine)

Por entidade (ad/adset/campanha) e janela, calculadas SÓ com atribuições `medium+`:

- **Leadgen/B2B:** leads, MQLs, reuniões agendadas/realizadas, deals criados, **pipeline gerado (R$)**, deals ganhos, receita ganha, **CPL → custo/reunião → CAC real**, taxa lead→reunião e reunião→venda POR CAMPANHA, tempo médio de conversão, motivo de perda dominante.
- **E-commerce:** pedidos reais, receita real (vs. reportada pela Meta), **lucro bruto** (receita − custo ERP), ticket médio real, taxa de reembolso, **ROAS real e POAS (profit over ad spend)**, receita de recompra em 60/90d → **LTV por campanha de aquisição**.
- **Cobertura de atribuição:** % dos eventos do período que o sistema conseguiu atribuir com confiança ≥ medium (KPI de saúde do tracking — se < 60%, o agente prioriza consertar tracking antes de otimizar mídia).

### 3.3 Higiene de tracking como feature do produto

O sistema **gera e audita** a infraestrutura de rastreamento em vez de só consumi-la:

- **Gerador de UTM padrão**: convenção `utm_campaign={campaign_id}&utm_content={ad_id}` aplicável em massa via API da Meta (ação proposta pelo agente: "12 anúncios sem UTM padrão — corrigir?").
- **Auditor de tracking** (job semanal): anúncios sem UTM, LPs que não propagam fbclid, eventos do CRM chegando sem hints, divergência Meta vs. GA4 vs. pedidos reais acima de threshold.
- **Snippet de captura** (JS leve): persiste fbclid/utm em cookie/localStorage e injeta em qualquer formulário — instalação via GTM documentada no wizard.

---

## 4. Inteligência Cross-Domain (o agente fica muito mais esperto)

### 4.1 Contexto de negócio agora é VIVO

Campos do `business_context` que eram declarados passam a ser **medidos e reconciliados**: ticket médio real, margem real (ERP), ciclo de venda real, LTV real. Divergência declarado vs. medido vira insight ("você configurou ticket médio R$180, mas os compradores vindos de Meta têm ticket R$146 — recalibrei o CPA alvo sugerido").

### 4.2 Novos detectores de sinais (determinísticos, mesma biblioteca da Seção 6.3)

| Sinal | Heurística | Ação típica proposta |
|---|---|---|
| `CHEAP_LEADS_NO_REVENUE` | campanha com CPL ≤ média mas taxa lead→reunião/venda ≤ 50% da média da conta (mín. de leads p/ significância) | realocar budget p/ campanha com CAC real menor, mesmo com CPL maior |
| `HIDDEN_WINNER_REVENUE` | ROAS Meta medíocre, mas ROAS real/POAS acima do alvo (ticket real alto, recompra) | escalar; explicar a divergência ao usuário |
| `REFUND_LEAK` | taxa de reembolso da campanha ≥ 2× média | investigar promessa do criativo vs. produto; reduzir budget |
| `STOCK_RISK` | anúncio ativo aponta p/ produto com estoque < X dias de cobertura (velocidade de venda atual) | **pausar/reduzir anúncio antes de vender o que não tem** — guardrail de estoque |
| `STOCK_OPPORTUNITY` | produto com estoque alto + margem alta + campanha histórica performando | propor reativação/escala |
| `PIPELINE_STALL` | leads da campanha entram mas param na etapa Y do CRM ≥ N dias | alerta: problema é comercial, não de mídia — proteger o budget de corte injusto |
| `MEETING_NO_SHOW_SOURCE` | taxa de no-show de reuniões por campanha ≥ threshold | qualidade de público; propor ajuste de criativo/segmentação |
| `LTV_TIER_MISMATCH` | campanha adquirindo clientes com LTV < CAC | corte ou reposicionamento |
| `TRACKING_DEGRADED` | cobertura de atribuição caiu > 20 p.p. na semana | prioridade máxima: consertar antes de otimizar |
| `CHANNEL_CONFLICT` (com GA4) | conversões que a Meta reivindica mas GA4 mostra como brand/direct em ≥ X% | ajustar leitura de incrementalidade no relatório |

### 4.3 Account Snapshot v2 e prompt do Reasoner

O snapshot ganha um bloco `funnel` por entidade (métricas 3.2) + bloco `inventory` (top produtos anunciados × estoque) + `attribution_coverage`. O system prompt ganha novas regras: "priorize CAC real/POAS sobre CPA da Meta quando cobertura ≥ 60%", "nunca proponha escala de anúncio com `STOCK_RISK`", "diferencie problema de mídia de problema comercial (`PIPELINE_STALL`) e diga isso explicitamente".

Novos tipos de ação no schema: `FIX_UTM_BULK`, `PAUSE_FOR_STOCK`, `REBALANCE_BY_REAL_CAC`, `FLAG_COMMERCIAL_ISSUE` (ação que não toca a Meta — gera tarefa/alerta para o time comercial do cliente).

### 4.4 Chat e relatórios

Novas tools do chat: `get_funnel_metrics(entity, window)`, `get_attribution_detail(event_id)`, `get_inventory_status(skus)`, `trace_lead(email_or_id)` → "me mostra a jornada desse lead: anúncio → LP → CRM → reunião → deal". O relatório semanal passa a ter a seção "Mídia → Receita" (a única página que o dono do negócio realmente lê).

---

## 5. UX das Integrações

- **Marketplace de conexões** em `/app/integrations`: cards por categoria, status, saúde de sync, última sincronização, cobertura de atribuição da conta.
- **Wizard por conector** (3 passos): credencial → mapeamento (etapas do CRM ↔ eventos canônicos, campo de valor, campo de UTM/fonte) → validação com dados reais ("encontrei 1.243 deals nos últimos 90 dias, 61% com origem rastreável — conectar?").
- **Mapeador de pipeline do CRM**: o cliente arrasta as etapas do funil dele para os slots canônicos (lead → qualificado → reunião → proposta → ganho/perdido). Isso parametriza os detectores.
- **Painel "Verdade das Conversões"**: tabela Meta reportou × GA4 × CRM/pedidos reais, por campanha — a tela que vende o produto na demo.
- **Admin da plataforma**: monitoração de conectores por tenant (falhas de webhook, cursores travados, credenciais expiradas), volume de eventos ingeridos, custo de storage.

---

## 6. Modelo de dados — resumo das adições

`connections`, `business_events`, `contacts`, `products`, `attributions` (Seção 2/3) + `tracking_audits` (resultado do auditor), `event_mappings` (mapeamento do wizard por conexão). RLS idêntica à Etapa 1 (tudo pendurado em `org_id`). Volumetria: `business_events` e `attributions` são as tabelas que crescem — particionar por mês desde o início e agregar para `funnel_metrics_daily` (mesmo padrão de `metrics_daily`).

---

## 7. Roadmap da Etapa 2

**Onda 2.0 — Fundação de dados (2-3 semanas de dev focado)**
1. Interface `DataConnector`, tabelas canônicas, endpoint de webhook genérico com assinatura + idempotência.
2. Snippet de captura de fbclid/UTM + doc GTM.
3. Cascata de atribuição níveis 1–3 (click id, UTM, identidade) com testes.

**Onda 2.1 — Primeiros conectores + funil fechado visível**
4. GA4 + Pipedrive + Shopify/Nuvemshop (um de cada categoria).
5. Métricas de funil fechado no dashboard + painel "Verdade das Conversões".
6. Gerador/auditor de UTM (primeira ação cross-domain: `FIX_UTM_BULK`).

**Onda 2.2 — Inteligência cross-domain**
7. Detectores 4.2 + Snapshot v2 + prompt v2 + novas ações (incl. `PAUSE_FOR_STOCK` com guardrail).
8. ERP (Bling/Tiny/Odoo) → lucro e estoque; POAS no dashboard.
9. `trace_lead` no chat + relatório "Mídia → Receita".

**Onda 2.3 — Long-tail e escala**
10. Conector Make/n8n + Google Sheets + wizard de mapeamento genérico.
11. Nível 4 de atribuição (GA4 stitching) e cobertura como KPI do agente.
12. LTV por campanha e recomendação de realocação por CAC:LTV.

**Critério de pronto da etapa:** uma conta com Meta + CRM (ou e-commerce) conectados recebe, sem intervenção humana, uma recomendação do tipo *"A Campanha B tem CPL 32% maior que a A, porém CAC real 41% menor e pipeline 2,3× maior — proposta: mover 20% do budget de A para B"* — com evidências rastreáveis clicáveis até o lead/pedido individual.

---

## 8. Riscos específicos da etapa

| Risco | Mitigação |
|---|---|
| Tracking do cliente ruim → atribuição fraca → agente "cego" | Cobertura de atribuição como KPI explícito; auditor de tracking; agente prioriza consertar tracking antes de recomendar realocação; modos degradados por confiança |
| LGPD (dados pessoais de leads/compradores) | Armazenar apenas hashes (SHA-256) de email/telefone em `contacts`; PII bruta não persiste; DPA com clientes; base legal = legítimo interesse do controlador (cliente) — documentar papel de operador |
| Explosão de escopo de conectores | Modelo canônico + webhook genérico + Make/n8n cobrem o long-tail; só construir conector nativo com demanda comprovada |
| Volumetria de eventos | Partição mensal, agregados diários, retenção bruta configurável (ex: 13 meses) |
| Conflito de números (Meta vs GA4 vs CRM) confundir o usuário | Painel "Verdade das Conversões" com explicação didática das diferenças de modelo de atribuição; o agente sempre declara QUAL número está usando e por quê |
| Ação automática baseada em atribuição errada | Ações cross-domain sempre `risk ≥ medium` (exigem aprovação) até a conta atingir X semanas de cobertura estável |
