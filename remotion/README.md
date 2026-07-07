# Remotion — animação do ecossistema

A composição `Ecosystem` (`components/marketing/ecosystem/composition.tsx`) é a
animação do hero: o agente no centro fazendo a varredura (radar) dos sinais do
negócio — Lead, SQL, Ticket médio, Estoque, ERP, CRM — puxando cada um para
dentro. Todo o movimento é periódico no intervalo da composição, então o loop é
perfeito.

Na página ela é tocada ao vivo com `@remotion/player` (já instalado), montada
pós-idle e com poster estático para SSR/`prefers-reduced-motion` — ver
`components/marketing/ecosystem/ecosystem-animation.tsx`.

## Rodar o Studio / renderar um vídeo

O core do Remotion (`remotion` + `@remotion/player`) já está nas dependências.
Para o Studio e o render em arquivo é preciso a CLI (não incluída para não pesar
o bundle da app):

```bash
npm i -D @remotion/cli
npx remotion studio remotion/index.ts            # editor visual
npx remotion render remotion/index.ts Ecosystem out/ecosystem.mp4
```

Como a mesma composição roda no hero e no render, um vídeo exportado (ex.: para
a seção de prova social / S8) fica pixel-a-pixel consistente com a página. Para
cenários por segmento (leadgen, e-commerce), parametrize via `inputProps`.
