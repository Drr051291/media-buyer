# Snippet de captura de atribuição (fbclid/UTM)

Referência: `ETAPA2.md` seções 3.1 e 3.3 — nível 1 e 2 da cascata de atribuição
(`click_id` e `utm`) dependem de o cliente instalar esse snippet nas landing
pages/site onde o tráfego paga chega.

## O que o snippet faz

Arquivo: `public/tracking/copiloto-tracking.js` (servido pela própria
plataforma em `https://<seu-domínio>/tracking/copiloto-tracking.js`).

1. Ao carregar a página, lê `fbclid`, `gclid`, `utm_source`, `utm_medium`,
   `utm_campaign`, `utm_content`, `utm_term` da URL.
2. Se algum desses parâmetros estiver presente, salva o conjunto inteiro
   (last-click) em cookie **e** `localStorage`, junto com `landing_page`
   (URL atual) e `referrer`. Se a página não tiver nenhum parâmetro de
   campanha, mantém o que já estava salvo de uma visita anterior — cobre o
   caso do visitante navegar internamente antes de converter.
3. Injeta esses valores como campos ocultos (`<input type="hidden">`) em
   todos os `<form>` da página, com o mesmo nome dos campos
   (`fbclid`, `utm_campaign`, etc.), para que sejam enviados junto do
   formulário ao CRM/checkout do cliente.
4. Observa o DOM (`MutationObserver`) e repete a injeção em formulários
   adicionados dinamicamente depois do load (comum em builders de LP e SPAs).
5. Expõe `window.CopilotoTracking.getAttributionHints()` para checkouts sem
   `<form>` nativo (ex: SPA que monta o payload em JS) chamarem manualmente.

**Retenção:** 90 dias (cookie `max-age` e `localStorage`), para cobrir ciclos
de venda B2B longos (`business_context.ciclo_de_venda_dias`). Não coleta PII
— apenas parâmetros de campanha, URL da página e referrer.

## Instalação via Google Tag Manager (recomendado)

1. No GTM, crie uma **Tag** do tipo *Custom HTML*.
2. Cole:
   ```html
   <script src="https://<seu-domínio>/tracking/copiloto-tracking.js" async></script>
   ```
3. Trigger: **All Pages** (Page View).
4. Publique o container.

## Instalação direta (sem GTM)

Adicione antes do `</body>` de todas as páginas do site/LP:

```html
<script src="https://<seu-domínio>/tracking/copiloto-tracking.js" async></script>
```

## Lendo os hints manualmente (checkout via JS / SPA)

```js
var hints = window.CopilotoTracking.getAttributionHints();
// hints = { fbclid, gclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_page, referrer }
// inclua `hints` no payload enviado ao seu backend/CRM
```

## Como isso chega até a atribuição

Os campos injetados (`fbclid`, `utm_campaign`, etc.) precisam ser
propagados pelo CRM/checkout do cliente até o payload que ele envia ao
endpoint `POST /api/hooks/{connectionId}` (webhook genérico, ver
`app/api/hooks/[connectionId]/route.ts`), no campo `attribution_hints` do
evento canônico. A partir daí, a cascata de atribuição (`lib/attribution/cascade.ts`)
faz o matching — o snippet só garante que o dado exista na origem.
