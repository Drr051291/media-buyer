# Copiloto de Tráfego — Media Buyer

SaaS de IA para gestão de contas Meta Ads. Ver `PROJECT.md` para a especificação
completa do produto (contexto para Claude Code / agentes).

Estado atual: **Fases 1 a 4 completas** — fundação (auth + multi-tenancy),
wizard de conexão BYOT, `lib/meta/client.ts`, jobs de sync (entities/insights/
backfill/breakdowns), dashboard de métricas, Business Context, Metric Engine +
detectores de sinais, Reasoner (Claude) com Feed de Insights e relatório
semanal, guardrails + Action Executor com aprovação/rejeição/rollback no feed,
medição de resultado (D+4/D+7) e memória no prompt, chat com o agente (tools
read-only + `propose_action`), Autopilot para ações de risco baixo com
notificações, e o painel `/admin` (tenants, saúde de tokens, jobs, custo de
LLM, feature flags, kill switch).

## Stack

Next.js 16 (App Router) + Tailwind v4 + shadcn/ui, Supabase (Postgres + Auth +
Vault + pg_cron), Anthropic Claude (`claude-sonnet-5` para análise), Vitest.

## Setup local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie um projeto no [Supabase](https://supabase.com) e copie as chaves para
   `.env.local` (veja `.env.local.example`):

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   CRON_SECRET=              # protege /api/cron/*, gere um valor aleatório
   META_API_VERSION=v23.0
   # Conector GA4 (opcional — habilita o cruzamento de comportamento com mídia):
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/connectors/ga4/oauth/callback
   # Conector HubSpot (opcional — fecha o funil anúncio → lead → venda):
   HUBSPOT_CLIENT_ID=
   HUBSPOT_CLIENT_SECRET=
   HUBSPOT_OAUTH_REDIRECT_URI=http://localhost:3000/api/connectors/hubspot/oauth/callback
   ```

   Para o GA4, crie um projeto no Google Cloud Console, ative a **Google
   Analytics Data API** e a **Admin API**, configure a tela de consentimento
   OAuth (escopo `analytics.readonly`) e crie um **ID do cliente OAuth** do tipo
   "Aplicativo da Web" com o redirect URI acima (byte a byte). O cliente conecta
   pelo wizard em **Integrações → Google Analytics 4** (OAuth, sem tocar em
   JSON). Ver `ETAPA2-GA4.md`, Anexo A.

   Para o HubSpot, crie um app público numa conta de desenvolvedor HubSpot
   (não precisa de marketplace nem review), configure os escopos read-only e o
   redirect URI acima. O cliente conecta pelo wizard em **Integrações →
   HubSpot** (OAuth ou token de Private App). Passo a passo completo em
   `ETAPA-HUBSPOT.md`, seção 3.

3. Rode as migrations (`supabase/migrations/*.sql`) no seu projeto — via
   Supabase CLI (`supabase db push`) ou colando no SQL Editor do dashboard, na
   ordem numérica. Elas criam:
   - `organizations`, `org_members`, `platform_admins` + RLS (tenancy)
   - `meta_tokens`, `ad_accounts`, `sync_jobs`, `audit_log` + RLS
   - wrappers SQL para o Supabase Vault (`vault_create_secret` etc.),
     restritos a `service_role` — os tokens Meta nunca ficam em texto plano
   - `entities`, `metrics_daily` + função de agregação adset/campanha
     (`aggregate_recent_metrics_daily`, agendada via **pg_cron** — habilite a
     extensão em Database > Extensions no dashboard do Supabase; sem ela a
     migration só avisa e segue, mas o rollup precisa ser chamado manualmente)
   - `claim_next_sync_job`: reivindicação atômica de jobs pendentes
     (FOR UPDATE SKIP LOCKED), usada pelos workers de cron
   - `business_context`, `snapshots`, `insights`, `llm_usage` + RLS (Fase 2)
   - `guardrails`, `actions`, `action_results`, `chat_messages` + RLS (Fase 3)
     — `guardrails` ganha uma linha default via trigger sempre que uma conta é
     conectada; `actions.decision_note` guarda o motivo de rejeição (memória
     do agente)
   - `feature_flags`, `notifications` + RLS (Fase 4) — feature flags só são
     escritas por `platform_admins`; kill switch reaproveita
     `organizations.status='suspended'` e `ad_accounts.status='paused'` (já
     existiam desde a Fase 1/2, nunca usados até agora)
   - `connections`, `business_events`, `contacts`, `products`, `attributions`
     + RLS (Etapa 2 Onda 2.0) e `ga4_metrics_daily` (Onda 2.1 — conector GA4,
     upsert idempotente por chave natural; alimenta o cruzamento no snapshot)

3.1. Defina também `ANTHROPIC_API_KEY` no `.env.local` — o Reasoner e o
   relatório semanal chamam a API da Anthropic diretamente.

4. Suba o servidor:

   ```bash
   npm run dev
   ```

5. Em produção (Vercel), `vercel.json` já define o cron. Defina `CRON_SECRET`
   no projeto Vercel — ele envia automaticamente `Authorization: Bearer
   $CRON_SECRET` nas chamadas agendadas.

   **Plano Hobby da Vercel só permite cron 1x/dia** (e a frequência precisa
   ser exatamente essa — `*/10 * * * *` é rejeitado). Por isso o agendamento
   de produção usa um único endpoint, `/api/cron/sync`, rodando 1x/dia: ele
   roda o token health check e depois processa em loop, dentro de um
   orçamento de ~50s (`maxDuration=60`), quantos chunks de
   `sync_entities`/`sync_insights_daily`/`sync_insights_backfill`/
   `sync_breakdowns` couberem antes do timeout. Isso troca a frequência do
   roadmap original (6/6h, 3x/dia) por 1x/dia — aceitável para MVP; ao migrar
   para o plano Pro, é só voltar a agendar `/api/cron/sync-*` individualmente
   em `vercel.json` com a frequência da Seção 6.1 do PROJECT.md. Os endpoints
   individuais continuam existindo (úteis para disparo manual via curl).

## O que já funciona

- **Auth + multi-tenancy**: `/signup` cria usuário + organization (trigger
  `handle_new_user_org`); `/login` autentica; `proxy.ts` (Next 16 renomeou
  `middleware.ts`) renova a sessão e protege `/app/*` e `/admin/*`.
- **Wizard BYOT** (`/app/settings/connections`): cola o token do System User,
  valida via `/debug_token`, lista as contas via `/me/adaccounts`, salva o
  token no Supabase Vault e conecta as contas escolhidas em modo Observador.
- **`lib/meta/client.ts`**: wrapper da Graph API com leitura dos headers de
  rate limit (`x-business-use-case-usage`, `x-fb-ads-insights-throttle`),
  backoff exponencial em `code=4`/`code=17`/`subcode=1504022` e Batch API
  (até 50 chamadas).
- **Jobs de sync**, todos fatiados e retomáveis via `sync_jobs.cursor` (nunca
  puxam tudo numa invocação só). A lógica de cada um vive em
  `lib/engine/sync-workers.ts` e é chamada tanto pelo worker unificado
  `/api/cron/sync` (produção, ver acima) quanto pelos endpoints individuais
  `/api/cron/sync-*` (debug manual):
  - `sync_entities`: estrutura (campanhas/adsets/ads), 1 página de 1 nível
    por chunk.
  - `sync_insights_daily`: últimos 7 dias de insights nível ad, 1 conta por
    chunk.
  - `sync_insights_backfill`: 90 dias via Async Insights Jobs da Meta —
    submit/poll/download em chunks separados; disparado automaticamente ao
    conectar uma conta.
  - `sync_breakdowns`: publisher_platform/platform_position/age/gender, uma
    dimensão por chunk.
  - `token-health`: revalida todos os tokens a cada execução do worker,
    marca contas como `disconnected` quando o token cai.
  - Agregação adset/campanha a partir das linhas nível ad roda no Postgres
    via pg_cron (`aggregate_recent_metrics_daily`), não em código de aplicação.
- **Dashboard de métricas** (`/app/accounts/[id]`): drill-down
  campanha → adset → ad, comparação 7d vs 7d anterior (spend, CTR, CPM, CPA,
  ROAS), sempre lendo do Postgres (`metrics_daily`), nunca da Meta em tempo
  real.
- **Business Context** (`/app/accounts/[id]/context`): formulário com o
  perfil de negócio da conta (ticket médio, margem, CPA/ROAS alvo, restrições
  etc — PROJECT.md 6.2). Sugere CPA alvo automaticamente (70% do breakeven)
  quando o gestor não define um, mas nunca aplica sem confirmação.
- **Metric Engine + 6 detectores de sinais** (`lib/engine/metrics.ts`,
  `lib/engine/signals/*`): recalcula CPA/ROAS usando o evento de conversão
  real da conta (não mais o proxy genérico do sync), em janelas 3d/7d/14d/30d,
  e roda `CREATIVE_FATIGUE`, `CPA_SPIKE`, `WINNER_UNDERFUNDED`,
  `LOSER_OVERFUNDED`, `SPEND_ANOMALY`, `NO_SIGNIFICANCE` — tudo determinístico,
  sem LLM.
- **Reasoner (Claude Sonnet 5)** (`lib/engine/reasoner.ts`): recebe o Account
  Snapshot (Metric Engine + sinais) e o Business Context, devolve diagnóstico
  + health score + insights + ações propostas em JSON estruturado
  (`output_config.format` com Zod). Validação pós-LLM descarta insights/ações
  que referenciam entidades inexistentes ou violam o guardrail padrão de
  variação de budget (±20%) — nunca a análise inteira.
- **Feed de Insights** (`/app/accounts/[id]/insights`): mostra o diagnóstico,
  as ações propostas (com botões Aprovar/Rejeitar) e o histórico de ações
  decididas (com Reverter para as executadas e o resultado medido).
- **Relatório semanal** (`/app/reports/[id]`): agrega os últimos 7
  diagnósticos diários e pede um resumo em linguagem de negócio, gerado sob
  demanda (não persistido).
- **`llm_usage`**: toda chamada ao Claude (análise diária, relatório, chat)
  registra tokens de input/output/cache e custo estimado em USD.
- O job `daily_analysis` roda dentro do mesmo worker unificado `/api/cron/sync`
  (1 conta por chunk, como os demais jobs).
- **Guardrails + Action Executor** (`lib/engine/guardrails.ts`,
  `lib/engine/executor.ts`): variação máxima de budget, teto de spend diário,
  cooldown, entidades protegidas, janela de execução e máximo de ações/dia —
  todos verificados antes de qualquer mutação na Meta
  (`lib/meta/mutations.ts`: pausar/reativar, ajustar budget, duplicar adset).
  Toda execução guarda o `previous_state` para rollback (`revertAction`) e
  audita em `audit_log`.
- **Aprovação/rejeição/rollback** (`/api/actions/[id]/{approve,reject,revert}`):
  respeitam a RLS (`is_org_contributor` — viewer não decide nada) e o modo
  Observador (nunca executa, mesmo se aprovado). Rejeitar aceita um motivo
  opcional (`decision_note`), usado depois como memória do agente.
- **Medição de resultado** (`lib/engine/action-results.ts`, job
  `measure_action_results`): mede o CPA da entidade no evento real da conta em
  D0 (véspera da execução), D+4 e D+7, classifica o veredito
  (`improved`/`neutral`/`worsened`) e grava em `action_results`.
- **Memória do agente** (`lib/engine/memory.ts`): resume as últimas ações
  executadas (com resultado medido) e rejeitadas (com motivo) — injetado no
  prompt do Reasoner a cada análise diária.
- **Chat com o agente** (`/app/accounts/[id]/chat`, `/api/chat`): tool use com
  Claude Sonnet 5 — `get_metrics`, `get_business_context`, `get_action_history`
  e `run_signal_scan` são só leitura; `propose_action` cria um card pendente
  no feed (nunca executa nada na Meta).
- **Autopilot** (`lib/engine/autopilot.ts`): em contas com
  `autonomy_mode='autopilot'`, ações `risk='low'` são auto-aprovadas e
  executadas assim que propostas (pelo job diário ou pelo chat) — ainda
  passando pelos mesmos guardrails do Executor. `medium`/`high` continuam
  pendentes de aprovação humana. Toda execução ou bloqueio gera uma
  notificação (`/app/notifications`, com contador no menu lateral).
- **Configurações da conta** (`/app/accounts/[id]/settings`): seletor de modo
  de autonomia (Observador/Copiloto/Autopilot — Autopilot só aparece
  liberado se o admin da plataforma habilitar a feature flag
  `autopilot_enabled` do tenant) e formulário de guardrails (variação máxima
  de budget, teto de spend diário, cooldown, entidades protegidas, janela de
  execução, máximo de ações/dia).
- **Painel `/admin`** (`platform_admins`, PROJECT.md 2.2): `tenants` (lista de
  organizations com kill switch — suspender bloqueia toda sincronização e
  execução do tenant), `tokens-health` (saúde de todos os tokens Meta),
  `jobs` (fila de `sync_jobs` por status + falhas recentes), `llm-usage`
  (custo de LLM agregado por tenant/finalidade nos últimos 30 dias) e `flags`
  (toggle de feature flags por tenant, hoje só `autopilot_enabled`).

## O que ainda não foi implementado

Fica para a Fase 5 do roadmap (`PROJECT.md` seção 10): Stripe (assinatura por
nº de contas conectadas + fair-use de LLM) e onboarding self-service com
e-mails transacionais.

## Testes

```bash
npm test     # vitest — lib/meta/*, lib/engine/*
npm run lint
npm run build
```
