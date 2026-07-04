# Copiloto de Tráfego — Media Buyer

SaaS de IA para gestão de contas Meta Ads. Ver `PROJECT.md` para a especificação
completa do produto (contexto para Claude Code / agentes).

Estado atual: **Fase 1, Etapas 1-3** — fundação (auth + multi-tenancy), wizard
de conexão BYOT e o wrapper `lib/meta/client.ts`.

## Stack

Next.js 16 (App Router) + Tailwind v4 + shadcn/ui, Supabase (Postgres + Auth +
Vault), Anthropic Claude (fases seguintes), Vitest.

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

4. Suba o servidor:

   ```bash
   npm run dev
   ```

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
- **`/api/cron/token-health`**: revalida todos os tokens diariamente
  (protegido por `CRON_SECRET`), marca contas como `disconnected` quando o
  token cai.

## O que ainda não foi implementado

Fica para as próximas etapas do roadmap (`PROJECT.md` seção 10): jobs de sync
de entidades/insights, dashboard de métricas, Business Context, Metric
Engine + detectores de sinais, Reasoner (Claude), Action Executor, chat,
autopilot e painel `/admin`.

## Testes

```bash
npm test     # vitest — lib/meta/rate-limit.ts, client.ts, debug-token.ts
npm run lint
npm run build
```
