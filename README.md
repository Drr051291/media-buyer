# Copiloto de Tráfego — Media Buyer

SaaS de IA para gestão de contas Meta Ads. Ver `PROJECT.md` para a especificação
completa do produto (contexto para Claude Code / agentes).

Estado atual: **Fase 1 completa** — fundação (auth + multi-tenancy), wizard de
conexão BYOT, `lib/meta/client.ts`, jobs de sync (entities/insights/backfill/
breakdowns) e dashboard de métricas com comparação de período.

## Stack

Next.js 16 (App Router) + Tailwind v4 + shadcn/ui, Supabase (Postgres + Auth +
Vault + pg_cron), Anthropic Claude (fases seguintes), Vitest.

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
   ```

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

4. Suba o servidor:

   ```bash
   npm run dev
   ```

5. Em produção (Vercel), `vercel.json` já define os crons. Defina `CRON_SECRET`
   no projeto Vercel — ele envia automaticamente `Authorization: Bearer
   $CRON_SECRET` nas chamadas agendadas. Ajuste a frequência conforme seu
   plano (Hobby só permite 1x/dia).

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
- **Jobs de sync** (`/api/cron/sync-*`), todos fatiados e retomáveis via
  `sync_jobs.cursor` (nunca puxam tudo numa invocação só):
  - `sync-entities`: estrutura (campanhas/adsets/ads), 1 página de 1 nível
    por invocação.
  - `sync-insights-daily`: últimos 7 dias de insights nível ad, 1 conta por
    invocação.
  - `sync-insights-backfill`: 90 dias via Async Insights Jobs da Meta —
    submit/poll/download em invocações separadas; disparado automaticamente
    ao conectar uma conta.
  - `sync-breakdowns`: publisher_platform/platform_position/age/gender, uma
    dimensão por invocação.
  - `token-health`: revalida todos os tokens diariamente, marca contas como
    `disconnected` quando o token cai.
  - Agregação adset/campanha a partir das linhas nível ad roda no Postgres
    via pg_cron (`aggregate_recent_metrics_daily`), não em código de aplicação.
- **Dashboard de métricas** (`/app/accounts/[id]`): drill-down
  campanha → adset → ad, comparação 7d vs 7d anterior (spend, CTR, CPM, CPA,
  ROAS), sempre lendo do Postgres (`metrics_daily`), nunca da Meta em tempo
  real.

## O que ainda não foi implementado

Fica para as próximas fases do roadmap (`PROJECT.md` seção 10): Business
Context, Metric Engine + detectores de sinais, Reasoner (Claude), Action
Executor com guardrails, chat, autopilot e painel `/admin`.

## Testes

```bash
npm test     # vitest — lib/meta/*, lib/engine/*
npm run lint
npm run build
```
