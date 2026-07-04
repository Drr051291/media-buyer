# Copiloto de Tráfego — SaaS de IA para Gestão de Meta Ads

> **Documento de contexto para Claude Code.** Use este arquivo como `CLAUDE.md` / `PROJECT.md` na raiz do repositório. Ele descreve o produto, a arquitetura, o modelo de dados, o motor de inteligência e a ordem de implementação. Nome do produto é provisório.

---

## 1. Visão do Produto

SaaS no modelo **AI as a Service** que "substitui" (na prática: multiplica) o gestor de tráfego, operando contas de **Meta Ads**. A IA analisa métricas continuamente, entende o contexto do negócio de cada conta e **propõe ou executa ações** na conta de anúncios (pausar anúncios, redistribuir budget, escalar vencedores, alertar anomalias).

**Público-alvo (B2B):** gestores de tráfego, agências e profissionais de mídia paga que gerenciam múltiplas contas. O produto NÃO é para o dono da PME leiga — é para o profissional que quer escalar de 15 contas para 50 sem contratar.

**Proposta de valor central:**
1. **Análise de métricas com contexto de negócio** — a IA não olha só CPA/ROAS genérico; ela sabe que a Conta X é um e-commerce de joias com ticket médio R$180 e margem de 55%, e que a Conta Y é geração de leads B2B com ciclo de venda de 30 dias. As recomendações mudam completamente em função disso.
2. **Capacidade de operar a conta** — não é só dashboard. A plataforma executa ações via Marketing API, com trilha de auditoria e guardrails.
3. **Transparência** — toda ação vem com diagnóstico, justificativa e impacto esperado. O gestor aprende com o agente, não é substituído às cegas.

**Escopo da V1:** apenas Meta Ads. Google Ads e TikTok ficam para versões futuras (mas a arquitetura usa abstração `AdsProvider` para facilitar).

**Decisão estratégica de autenticação (V1):** **BYOT — Bring Your Own Token.** Sem app verificado da Meta, sem App Review, sem Business Verification. Cada cliente gera um token de System User no próprio Business Manager e cola na plataforma. Detalhes na Seção 5.

---

## 2. Personas e Modelo de Acesso

### 2.1 Hierarquia

```
Plataforma (super admin — você)
└── Organization (tenant = agência ou gestor independente)
    ├── Membros (owner, admin, analyst, viewer)
    └── Ad Accounts (contas Meta conectadas via token)
        └── Business Context (perfil de negócio por conta)
```

### 2.2 Painéis

**Painel Admin da Plataforma** (`/admin`) — acesso exclusivo do time interno:
- Lista de tenants: plano, nº de contas conectadas, spend agregado sob gestão, status.
- Saúde dos tokens Meta por tenant (válido / expirando / revogado / rate-limited).
- Consumo de LLM por tenant (tokens in/out, custo estimado em USD) — insumo para pricing.
- Fila de jobs: syncs pendentes, falhas, retries.
- Feature flags por tenant (ex: liberar autopilot só para beta testers).
- Logs de erro e audit trail global.
- Gestão de billing (fase posterior — Stripe).

**Painel do Cliente** (`/app`) — o produto em si:
- **Dashboard**: visão consolidada de todas as contas + drill-down por conta/campanha/adset/anúncio. Métricas com comparação de período e tendência.
- **Feed de Insights & Ações** (o coração do produto): cards diários gerados pelo agente — cada card tem diagnóstico, ação proposta, justificativa, impacto esperado e botões [Aprovar] [Rejeitar] [Editar]. Histórico de ações executadas com resultado medido.
- **Chat com o Agente**: conversa em linguagem natural sobre a conta ("por que o CPA subiu ontem?", "audita a campanha X", "sugere uma estrutura de teste de criativo").
- **Contexto de Negócio**: formulário/wizard por conta de anúncio onde o cliente configura o perfil do negócio (Seção 6.2). É o que diferencia o produto.
- **Configuração de Autonomia**: modo Observador / Copiloto / Autopilot + guardrails por conta.
- **Relatórios**: relatório semanal/mensal gerado pela IA em linguagem de negócio (exportável, para o gestor mandar ao cliente final dele).
- **Conexões**: gestão de tokens Meta (adicionar, validar, ver saúde, remover).

---

## 3. Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Frontend + API | Next.js 15 (App Router) + Tailwind + shadcn/ui | Full-stack em um repo, deploy Vercel |
| Banco + Auth | Supabase (Postgres + RLS + Auth) | Multi-tenant nativo com RLS, familiaridade |
| IA Core | Anthropic Claude API (`claude-sonnet-4-6` para análise; considerar Haiku para tarefas leves como classificação) | Tool use estruturado, raciocínio forte |
| Jobs / Filas | **Vercel Cron** (chama `/api/cron/*` para jobs que tocam Meta/Claude) + **pg_cron no Supabase** (tarefas puramente de banco: agregações, limpeza, materialização de snapshot) + tabela de fila (`sync_jobs`) | Sem serviço de fila de terceiros na V1. Trigger.dev só se o volume de contas justificar depois |
| Cache | Upstash Redis | Cache de leituras Meta (5–15 min), rate limit buckets |
| Integração Meta | Graph API direta (Marketing API v23+) via wrapper próprio `lib/meta/` | Controle total de rate limit, batch e erros. NÃO usar MCP na V1 (o MCP oficial exige login do usuário Meta — incompatível com BYOT server-side) |
| Criptografia de tokens | **Supabase Vault (`pgsodium`)** — decisão fechada | Criptografia nativa no banco; elimina `TOKEN_ENCRYPTION_KEY` do app e código de crypto próprio. Tokens NUNCA em texto plano |
| Deploy | Vercel + Supabase Cloud | Velocidade |
| Billing (fase 5) | Stripe | Assinatura + metered por conta conectada |

### 3.1 Abstração de provedor

```typescript
// lib/providers/ads-provider.ts
interface AdsProvider {
  validateToken(token: string): Promise<TokenHealth>;
  listAdAccounts(token: string): Promise<AdAccount[]>;
  fetchInsights(params: InsightsQuery): Promise<InsightRow[]>;
  fetchEntities(level: 'campaign'|'adset'|'ad'): Promise<Entity[]>;
  executeAction(action: AdAction): Promise<ActionResult>;
}
// V1: MetaProvider implements AdsProvider
// Futuro: GoogleAdsProvider, TikTokProvider
```

### 3.2 Infraestrutura de execução (Vercel + Supabase) — regras obrigatórias

**Timeout da Vercel dita o desenho dos jobs.** Serverless functions têm limite de execução (extensível no plano Pro/Fluid Compute, mas nunca infinito). Portanto:

- **Todo job que toca a Meta é fatiado e retomável.** Cada invocação de `/api/cron/*` processa UM chunk (uma conta, ou uma janela de datas de uma conta), grava progresso em `sync_jobs` (`cursor`, `status`, `next_chunk`) e retorna. O orquestrador re-invoca até `status = done`. É proibido escrever loops que tentem puxar 90 dias de todas as contas numa execução só.
- O backfill de 90 dias usa async jobs da Meta (`async=true` → `report_run_id`): uma invocação submete o job, outra faz o poll, outra baixa o resultado — três etapas separadas, cada uma dentro do timeout.
- Chamadas ao Claude (análise diária) também rodam 1 conta por invocação.

**Divisão de agendamento:**

| Agendador | Responsabilidade |
|---|---|
| **Vercel Cron** → `/api/cron/*` (protegidos por `CRON_SECRET`) | Jobs com I/O externo: syncs Meta, health check de tokens, análise diária (Claude), execução de ações aprovadas, medição de resultados D+4/D+7 |
| **pg_cron (Supabase)** | Tarefas puramente de banco: agregação adset/campanha a partir de `metrics_daily`, materialização de views do dashboard, limpeza de logs antigos, expiração de caches |

**Segredos:** tokens Meta vivem no **Supabase Vault** (`vault.create_secret` / view `vault.decrypted_secrets`, acessível apenas via `service_role` no backend). A tabela `meta_tokens` guarda somente o `vault_secret_id` + metadados — nunca o token.

---

## 4. Arquitetura Geral (visão de camadas)

```
┌──────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js)                                       │
│  /app (cliente)  |  /admin (plataforma)                   │
└─────────────┬────────────────────────────────────────────┘
              │ API Routes / Server Actions
┌─────────────▼────────────────────────────────────────────┐
│  CAMADA DE APLICAÇÃO                                      │
│  auth · tenancy · feed de ações · chat · relatórios       │
└──────┬──────────────────────┬────────────────────────────┘
       │                      │
┌──────▼──────────┐   ┌───────▼───────────────────────────┐
│ DATA LAYER      │   │ INTELLIGENCE ENGINE                │
│ Sync Meta →     │   │ 1. Metric Engine (determinístico)  │
│ Postgres        │   │ 2. Signal Detector (estatístico)   │
│ (metrics_daily, │──▶│ 3. LLM Reasoner (Claude + tools)   │
│ snapshots)      │   │ 4. Action Executor (+ guardrails)  │
└──────┬──────────┘   └───────┬───────────────────────────┘
       │                      │ write actions
┌──────▼──────────────────────▼────────────────────────────┐
│ META MARKETING API (Graph API, token System User BYOT)    │
└──────────────────────────────────────────────────────────┘
```

Princípio central: **o LLM nunca calcula números e nunca chama a Meta diretamente.** Números são calculados em código (Metric Engine). Ações passam pelo Executor com guardrails. O LLM recebe dados já processados e devolve raciocínio + ações em schema estruturado.

---

## 5. Autenticação Meta — Estratégia BYOT (V1)

### 5.1 Por que BYOT

- Criar app verificado com Advanced Access em `ads_management` exige App Review + Business Verification (semanas de processo).
- **Em modo Development, um app funciona normalmente para contas onde o próprio dono é admin.** Como cada cliente gera o token no PRÓPRIO Business Manager (com o próprio app ou system user), a plataforma nunca precisa de Advanced Access.
- Bônus: os rate limits ficam distribuídos por cliente (cada token pertence a um app/BM diferente), em vez de concentrados num único app da plataforma.
- Trade-off aceito: onboarding com mais fricção (o cliente precisa seguir um passo a passo técnico). Mitigação: o público-alvo é técnico (gestores de tráfego) e o wizard de onboarding guia tudo. Estratégia B (OAuth com app verificado) fica documentada para a V2, escondida atrás da mesma interface `MetaProvider`.

### 5.2 Fluxo de onboarding do token (wizard no painel)

O wizard exibe passo a passo com screenshots/GIFs:

1. **Criar app Meta** (se não tiver): developers.facebook.com → Create App → tipo "Business" → adicionar produto "Marketing API". Fica em Development mode — sem problema.
2. **Criar System User** no Business Manager: Configurações do Negócio → Usuários → Usuários do Sistema → Adicionar (tipo Admin ou Employee).
3. **Atribuir ativos ao System User**: adicionar a(s) conta(s) de anúncio com permissão "Gerenciar campanhas" (`ads_management`).
4. **Gerar token**: no System User → Gerar Token → selecionar o app → escopos `ads_management`, `ads_read`, `business_management` → expiração "Nunca".
5. **Colar o token na plataforma.**

### 5.3 Validação e saúde do token (backend)

Ao receber o token:
```
GET /debug_token?input_token={token}&access_token={token}
→ valida: is_valid, scopes (exige ads_read no mínimo; ads_management para modos com execução), expires_at
GET /me/adaccounts?fields=id,name,account_status,currency,timezone_name
→ lista contas acessíveis; usuário seleciona quais conectar
```
- Salvar token criptografado (`meta_tokens.encrypted_token`), nunca logar o valor.
- Se o token só tem `ads_read`: conta entra automaticamente em modo **Observador** (análise sem execução) — isso é um recurso de vendas, não um bug ("comece só com leitura, dê permissão de escrita quando confiar").
- **Health check diário** (cron): re-valida cada token; se inválido/revogado → marca conta como `disconnected`, pausa jobs, notifica cliente (e aparece no admin).

### 5.4 Segurança

- Token em repouso no **Supabase Vault** (`pgsodium`); tabela `meta_tokens` guarda só o `vault_secret_id`. Descriptografia exclusivamente no backend via `service_role`.
- Token nunca vai ao frontend depois de salvo (exibir só últimos 4 chars).
- RLS garante que tenant A jamais lê token do tenant B.
- Audit log de toda leitura/uso do token por job.

---

## 6. Intelligence Engine — como a IA lê métricas e decide (A PARTE MAIS IMPORTANTE)

O motor tem **4 estágios em pipeline**. Regra de ouro: determinístico primeiro, LLM por último.

### 6.1 Estágio 1 — Data Layer (sync de métricas)

**O que sincronizar (jobs agendados):**

| Job | Frequência | Conteúdo |
|---|---|---|
| `sync_entities` | 6/6h | Estrutura: campanhas, adsets, ads (id, nome, status, objetivo, budget, targeting resumido, creative_id, datas) |
| `sync_insights_daily` | 3x/dia (manhã, tarde, noite) | Insights nível **ad** com `time_increment=1`, últimos 7 dias (re-fetch cobre atualização de atribuição), agregação para adset/campanha feita em SQL |
| `sync_insights_backfill` | 1x no onboarding | 90 dias de histórico via **async jobs** (`async=true` → poll `report_run_id`) |
| `sync_breakdowns` | 1x/dia | Breakdowns leves: `publisher_platform`, `platform_position`, `age`, `gender` — em chamadas separadas, nunca compostos |
| `token_health` | 1x/dia | `/debug_token` de todos os tokens |

**Campos de insights (nível ad):** `spend, impressions, reach, frequency, clicks, inline_link_clicks, ctr, cpm, cpc, actions, action_values, cost_per_action_type, purchase_roas, video_thruplay_watched_actions, quality_ranking, engagement_rate_ranking, conversion_rate_ranking`.

**Disciplina de rate limit (obrigatório no wrapper `lib/meta/client.ts`):**
- Ler headers `x-fb-ads-insights-throttle` e `x-business-use-case-usage` em TODA resposta; persistir % de utilização por conta.
- Backoff exponencial em erro `code=4` / `code=17` / subcode `1504022`; pausar fila da conta se utilização > 80%.
- Batch API (até 50 calls por request) para leituras de entidades.
- Cache Redis 5–15 min para leituras repetidas (ex: usuário navegando no dashboard).
- Pedir só os fields necessários; nunca combinar múltiplos breakdowns numa chamada; queries longas → async jobs.
- Filtro `filtering=[{field:'spend',operator:'GREATER_THAN',value:0}]` para não puxar linhas mortas.

**Armazenamento:** tabela `metrics_daily` (uma linha por ad por dia por breakdown-key) — fonte da verdade local. Dashboards e o motor leem SEMPRE do Postgres, nunca da Meta em tempo real (exceto refresh manual explícito).

### 6.2 Estágio 2 — Business Context Profile (o diferencial)

Cada conta de anúncio tem um perfil estruturado, preenchido no onboarding (wizard conversacional — o próprio Claude pode conduzir a entrevista no chat) e editável depois. Armazenado em `business_context` (JSONB + colunas tipadas para o que entra em cálculo):

```jsonc
{
  "business_model": "ecommerce | leadgen | app | local | infoproduto | saas",
  "vertical": "joias e acessórios",
  "descricao_livre": "E-commerce de semijoias, público feminino 25-45, forte em datas comemorativas",
  "objetivo_principal": "purchase",           // evento de conversão que importa
  "eventos_secundarios": ["add_to_cart", "initiate_checkout"],
  "ticket_medio": 180.0,
  "margem_bruta_pct": 55,
  "cpa_alvo": 45.0,                            // ou roas_alvo
  "roas_alvo": 4.0,
  "cpa_maximo_aceitavel": 65.0,                // linha vermelha
  "ltv_estimado": 320.0,                       // se houver recompra
  "ciclo_de_venda_dias": 0,                    // leadgen B2B pode ter 30+
  "orcamento_mensal": 15000.0,
  "estrategia": "escala | eficiencia | teste", // o que otimizar agora
  "sazonalidade": ["dia das mães", "natal", "black friday"],
  "restricoes": ["nunca pausar a campanha 'Institucional'", "não mexer em budget aos domingos"],
  "notas_do_gestor": "cliente odeia CPM alto mesmo com ROAS bom, priorizar explicar isso"
}
```

**Por que isso muda tudo:** CPA de R$60 é desastre para a conta de ticket R$100 e excelente para a de ticket R$800. Frequência 4 é fadiga num e-commerce broad e normal num remarketing. Sem contexto, qualquer análise é genérica — é exatamente o que o Ads Manager já mostra. O contexto é injetado no prompt do LLM e usado nos thresholds do detector de sinais.

**Derivação automática de thresholds:** se o cliente não define CPA alvo, calcular proxy: `cpa_breakeven = ticket_medio * margem_bruta_pct` e sugerir alvo = 70% do breakeven. Sempre mostrar a conta ao usuário e pedir confirmação.

### 6.3 Estágio 3 — Metric Engine + Signal Detector (determinístico)

Roda 1x/dia por conta (após o sync da manhã), em código TypeScript puro, sem LLM. Produz o **Account Snapshot**: um JSON compacto com métricas derivadas + sinais detectados.

**Métricas derivadas (por entidade, janelas 3d / 7d / 14d / 30d):**
- CPA e ROAS reais sobre o evento definido no contexto (não o default da Meta).
- Deltas período contra período (7d vs 7d anterior) para spend, CPA, ROAS, CTR, CPM, frequência.
- Share de spend por campanha/adset (concentração de budget).
- Custo por evento secundário (funil: CPM → CTR → CPC → tx. LP → tx. conversão) para localizar ONDE o funil quebrou quando o CPA sobe.
- `dias_de_dados` e volume de conversões (para o LLM não tirar conclusão sem significância).

**Sinais (biblioteca de detectores — cada um retorna `{signal, entity, severity, evidence}`):**

| Sinal | Heurística (parametrizada pelo contexto) |
|---|---|
| `CREATIVE_FATIGUE` | frequência 7d > threshold do modelo de negócio E CTR 7d caiu >25% vs 14d anteriores E CPA subiu |
| `CPA_SPIKE` | CPA 3d > 1.3 × CPA 14d, com nº mínimo de conversões nas duas janelas |
| `ROAS_BELOW_TARGET` | ROAS 7d < roas_alvo com spend relevante (> X% do budget diário) |
| `WINNER_UNDERFUNDED` | adset com CPA ≤ 80% do alvo e volume estável recebendo < 15% do spend da campanha |
| `LOSER_OVERFUNDED` | adset com CPA > cpa_maximo por 5+ dias consumindo > 20% do spend |
| `LEARNING_RESET_RISK` | edição de budget/estrutura detectada em entidade que saiu da aprendizagem há < 7 dias |
| `SPEND_ANOMALY` | spend do dia > 2 desvios-padrão da média 30d (ou zero gasto em campanha ativa) |
| `FUNNEL_BREAK` | CTR estável mas conversão pós-clique caiu >40% → provável problema de LP/pixel, não de mídia |
| `AUCTION_PRESSURE` | CPM 7d subiu >30% com CTR estável → pressão de leilão, não criativo |
| `NO_SIGNIFICANCE` | entidade com spend mas < 10 conversões na janela → proibir conclusões |
| `OPPORTUNITY_DAYPART/PLACEMENT/DEMO` | breakdown com CPA ≤ 60% da média da entidade e volume mínimo |

Cada detector é uma função pura testável (`lib/engine/signals/*.ts`). **Este estágio é o que garante que a plataforma não alucina número.**

### 6.4 Estágio 4 — LLM Reasoner (Claude)

Job diário `daily_analysis` por conta (e sob demanda via chat). Input do prompt:

1. **System prompt**: persona de gestor de tráfego sênior, regras de decisão (ex: "nunca proponha mudança de budget > guardrail", "sem significância → recomende esperar", "sempre explique o porquê em linguagem de negócio").
2. **Business Context Profile** (Seção 6.2).
3. **Account Snapshot** (Seção 6.3) — métricas derivadas + sinais, JSON compacto (só entidades com spend ou com sinal; teto de tokens).
4. **Memória**: últimas N ações executadas + resultado medido ("há 6 dias aumentamos o budget do adset X em 20% → CPA se manteve, ROAS +12%") + recomendações rejeitadas pelo usuário e o motivo (aprender a preferência do gestor).

Output — **tool use / JSON schema obrigatório**:

```typescript
{
  diagnosis: string,          // resumo executivo do estado da conta (PT-BR, linguagem de negócio)
  health_score: number,       // 0-100, calculado com rubrica declarada no prompt
  insights: [{
    entity_ref: {level, id, name},
    finding: string,          // o que foi observado
    evidence: string[],       // números citados DEVEM vir do snapshot (validar em código)
    severity: "info" | "warning" | "critical"
  }],
  proposed_actions: [{
    type: "PAUSE_AD" | "PAUSE_ADSET" | "ADJUST_BUDGET" | "DUPLICATE_ADSET"
        | "REALLOCATE_BUDGET" | "CHANGE_BID" | "REACTIVATE" | "SUGGEST_CREATIVE_REFRESH"
        | "NO_ACTION_WAIT",
    entity_ref: {level, id, name},
    params: { /* ex: {new_daily_budget: 240, change_pct: +20} */ },
    reasoning: string,        // justificativa ancorada no contexto de negócio
    expected_impact: string,  // "redução estimada de 10-15% no CPA da campanha"
    risk: "low" | "medium" | "high",
    priority: 1 | 2 | 3
  }]
}
```

**Validação pós-LLM (em código):** entity_ids existem? valores numéricos citados batem com o snapshot (tolerância)? ação viola guardrail? Se falhar → retry com feedback ou descarte. Só então os cards entram no feed.

**Custo de LLM:** registrar `input_tokens/output_tokens` por chamada em `llm_usage` (visível no admin). Otimizações: snapshot compacto, prompt caching do system prompt, Haiku para triagem ("há algo relevante hoje?") antes de rodar Sonnet.

### 6.5 Action Executor + Guardrails + Autonomia

**Modos por conta (configurável pelo cliente):**

| Modo | Comportamento |
|---|---|
| **Observador** | Só análise e alertas. Nenhuma escrita. (default; único modo se token for read-only) |
| **Copiloto** | Ações entram no feed pendentes; executa só após clique em Aprovar. (modo principal da V1) |
| **Autopilot** | Executa automaticamente ações `risk=low` dentro dos guardrails; `medium/high` continuam pedindo aprovação. Notifica tudo. (fase 4) |

**Guardrails (tabela `guardrails`, por conta, com defaults sensatos):**
- Variação máxima de budget por ação: ±20%/dia por entidade.
- Teto de spend diário da conta (hard cap) — nenhuma ação pode projetar ultrapassá-lo.
- Cooldown: mesma entidade não sofre 2 mudanças de budget em < 48h (proteção da fase de aprendizagem).
- Entidades protegidas (blacklist vinda das `restricoes` do contexto).
- Horário de execução permitido; nº máximo de ações/dia por conta.
- Kill switch global por conta e por tenant (admin).

**Execução:** fila com idempotency key → chamada Graph API (`POST /{id}` com `daily_budget`, `status=PAUSED`, etc.) → gravar `actions.status = executed|failed` + response da Meta → **agendar medição de resultado** (`action_results`): snapshot da métrica-alvo no D0 e no D+4/D+7, delta calculado vira memória do agente (Seção 6.4, item 4). Rollback assistido: toda ação guarda o estado anterior e oferece botão "Reverter".

### 6.6 Chat com o Agente

Endpoint de chat com tool use. Tools expostas ao Claude (todas read-only exceto `propose_action`):
- `get_metrics(entity, window, breakdown?)` → lê do Postgres.
- `get_business_context()`.
- `get_action_history()`.
- `run_signal_scan()`.
- `propose_action(action)` → NÃO executa; cria card pendente no feed (mesmo pipeline de guardrails).

Assim o chat tem exatamente os mesmos limites do job diário — nenhuma via privilegiada para o LLM escrever na Meta.

---

## 7. Modelo de Dados (Supabase / Postgres com RLS)

```sql
-- Tenancy
organizations (id, name, plan, status, created_at)
org_members (org_id, user_id, role)  -- role: owner|admin|analyst|viewer
platform_admins (user_id)            -- painel /admin

-- Conexões Meta
meta_tokens (id, org_id, label, vault_secret_id, scopes text[], token_health,
             last_validated_at, created_by)  -- token real vive no Supabase Vault
sync_jobs → ganha colunas: cursor jsonb, next_chunk jsonb  -- jobs retomáveis (3.2)
ad_accounts (id, org_id, meta_token_id, meta_account_id, name, currency,
             timezone, status, autonomy_mode, connected_at)
business_context (ad_account_id PK, profile jsonb, cpa_alvo numeric,
                  roas_alvo numeric, cpa_maximo numeric, updated_at)
guardrails (ad_account_id PK, max_budget_change_pct, daily_spend_cap,
            cooldown_hours, protected_entity_ids text[], max_actions_per_day,
            execution_window jsonb)

-- Dados Meta (locais)
entities (id, ad_account_id, level, meta_id, parent_meta_id, name, status,
          objective, daily_budget, targeting_summary jsonb, creative_id,
          synced_at)                       -- campanhas, adsets, ads
metrics_daily (ad_account_id, entity_level, entity_meta_id, date,
               breakdown_key, spend, impressions, reach, frequency, clicks,
               link_clicks, ctr, cpm, cpc, conversions, conversion_value,
               cpa, roas, raw jsonb, PRIMARY KEY(...))
sync_jobs (id, ad_account_id, kind, status, started_at, finished_at,
           error, meta_usage_pct)

-- Inteligência
snapshots (id, ad_account_id, date, payload jsonb)         -- Account Snapshot
insights (id, ad_account_id, snapshot_id, entity_ref jsonb, finding,
          evidence jsonb, severity, created_at)
actions (id, ad_account_id, insight_id, type, entity_ref jsonb, params jsonb,
         previous_state jsonb, reasoning, expected_impact, risk, status,
         -- status: proposed|approved|rejected|executed|failed|reverted
         proposed_at, decided_by, decided_at, executed_at, meta_response jsonb)
action_results (action_id PK, metric, baseline_value, d4_value, d7_value,
                delta_pct, verdict)        -- verdict: improved|neutral|worsened
chat_messages (id, ad_account_id, user_id, role, content, tool_calls jsonb,
               created_at)

-- Operação da plataforma
llm_usage (id, org_id, ad_account_id, purpose, model, input_tokens,
           output_tokens, cost_usd, created_at)
audit_log (id, org_id, actor, event, payload jsonb, created_at)
```

**RLS:** todas as tabelas com `org_id` (direto ou via join com `ad_accounts`) → policy `org_id IN (select org_id from org_members where user_id = auth.uid())`. Tabelas de admin: policy via `platform_admins`. Jobs de backend usam `service_role` (bypass RLS) — nunca expor essa key no client.

---

## 8. Estrutura de Pastas

```
/app
  /(marketing)          # landing
  /app                  # painel do cliente
    /dashboard
    /accounts/[id]      # visão da conta: métricas, feed, chat, contexto, guardrails
    /reports
    /settings           # org, membros, conexões (tokens)
  /admin                # painel da plataforma
    /tenants  /tokens-health  /llm-usage  /jobs  /flags
  /api
    /meta/connect  /meta/validate
    /engine/run-analysis   # trigger manual
    /chat
    /actions/[id]/approve|reject|revert
    /cron/*               # endpoints chamados por pg_cron/Trigger.dev
/lib
  /meta        # client.ts (rate limit, batch, backoff), insights.ts, mutations.ts, debug-token.ts
  /engine
    /metrics.ts           # métricas derivadas
    /signals/*.ts         # detectores (1 arquivo por sinal, com testes)
    /snapshot.ts          # monta Account Snapshot
    /reasoner.ts          # chamada Claude + validação do output
    /executor.ts          # guardrails + execução + rollback
    /memory.ts            # histórico de ações p/ prompt
  /providers   # AdsProvider interface + MetaProvider
  /vault       # helpers de leitura/escrita de segredos no Supabase Vault (service_role only)
  /db          # queries tipadas (supabase-js ou drizzle)
/supabase
  /migrations
/tests
  /engine      # unit tests dos detectores e do executor (prioridade máxima)
```

---

## 9. Variáveis de Ambiente

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
# criptografia de tokens: Supabase Vault (sem chave em env)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=                 # protege /api/cron/*
META_API_VERSION=v23.0
# fase 5:
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## 10. Roadmap de Implementação (ordem para o Claude Code)

**Fase 1 — Fundação + Leitura (o produto já vira um dashboard multi-conta útil)**
1. Setup Next.js + Supabase + auth + multi-tenancy (organizations, members, RLS).
2. Wizard de conexão BYOT: validação de token, listagem de contas, criptografia, health check.
3. `lib/meta/client.ts` com rate limiting, batch e backoff (base de tudo).
4. Jobs de sync: entities + insights daily + backfill 90d async.
5. Dashboard de métricas (conta → campanha → adset → ad, comparação de período).

**Fase 2 — Motor de Análise (Observador)**
6. Business Context wizard (formulário; versão conversacional depois).
7. Metric Engine + primeiros 6 detectores de sinais (fatigue, cpa_spike, winner_underfunded, loser_overfunded, spend_anomaly, no_significance) com testes unitários.
8. Reasoner (Claude) + Feed de Insights (sem execução) + relatório semanal.
9. Registro de `llm_usage`.

**Fase 3 — Execução (Copiloto)** ← primeira versão vendável de verdade
10. Guardrails + Action Executor + aprovação no feed + rollback + audit log.
11. Medição de resultado (action_results) + memória no prompt.
12. Chat com o agente (tools read-only + propose_action).

**Fase 4 — Autopilot + Admin**
13. Autopilot para ações low-risk com notificações.
14. Painel /admin completo (tenants, saúde de tokens, jobs, LLM cost, flags, kill switch).

**Fase 5 — Comercial**
15. Stripe (assinatura por nº de contas conectadas + fair-use de LLM).
16. Onboarding self-service, e-mails transacionais, docs do wizard BYOT.

---

## 11. Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Cliente gera token com escopo errado / expira | `/debug_token` na conexão + health check diário + modo degradado read-only + alerta |
| Rate limit da Meta em contas grandes | Throttle headers monitorados, backoff, cache, async jobs, batch; limites por conta no wrapper |
| LLM alucinar métrica ou ação inválida | Números calculados em código; output em schema validado; evidence cross-check contra snapshot; guardrails no executor |
| Ação ruim queimar budget do cliente | Modo Copiloto como default, caps de variação, cooldown, hard cap diário, rollback 1-clique, kill switch |
| Reset de fase de aprendizagem por excesso de edição | Sinal `LEARNING_RESET_RISK` + cooldown de 48h no executor |
| Custo de LLM comer a margem | Triagem com modelo barato, prompt caching, snapshot compacto, tracking por tenant no admin |
| Fricção do onboarding BYOT | Wizard com vídeo/GIF passo a passo; público técnico; V2 com OAuth (Estratégia B) atrás da mesma interface |
| ToS da Meta / políticas de ads | Ações programáticas seguem as mesmas políticas do Ads Manager; nunca automatizar criação de anúncio com claims sensíveis na V1 (V1 executa apenas budget/status/duplicação) |

---

## 12. Premissas assumidas (confirmar/ajustar)

1. **Idioma do produto:** PT-BR, mercado brasileiro primeiro.
2. **Autonomia default:** Copiloto (aprovação humana); Autopilot é opt-in na fase 4.
3. **V1 executa apenas:** pausar/reativar, ajustar budget, duplicar adset. Criação de campanha/anúncio do zero e geração de criativo ficam para V2.
4. **Sem billing na V1** — validação com beta users manuais; Stripe na fase 5.
5. **Sem MCP na V1** — Graph API direta por causa do modelo BYOT server-side.
6. **Pricing futuro provável:** por conta de anúncio conectada + fair use de análises (dados do `llm_usage` vão calibrar).
