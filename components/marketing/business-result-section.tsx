import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/marketing/reveal";

const INTEGRATIONS = ["Pipedrive", "RD Station", "Shopify", "Nuvemshop", "Bling", "GA4", "Make"];

const ROWS = [
  {
    campaign: "Prospecção — Joias 25-45",
    reported: "2,1x",
    real: "4,3x",
    decision: "Escalar",
    good: true,
  },
  {
    campaign: "Remarketing — Carrinho",
    reported: "6,8x",
    real: "3,0x",
    decision: "Manter e observar",
    good: false,
  },
  {
    campaign: "Leadgen — Formulário B2B",
    reported: "CPL R$ 12",
    real: "CAC R$ 890",
    decision: "Revisar segmentação",
    good: false,
  },
];

export function BusinessResultSection() {
  return (
    <section
      id="integracoes"
      className="dark scroll-mt-16 bg-surface px-margin-mobile py-24 text-foreground md:px-margin-desktop"
    >
      <div className="mx-auto max-w-7xl">
        <Reveal className="max-w-2xl">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            O coração do produto
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Otimize pelo que virou venda — não pelo que a plataforma reporta
          </h2>
          <p className="mt-4 text-lg text-on-surface-variant">
            Mídia é o meio; o que importa é o resultado. Conecte seu CRM, e-commerce,
            ERP e GA4 e o Traffic Copilot cruza cada campanha — de qualquer canal — com
            leads qualificados, reuniões, vendas e margem real. CPL baixo com lead ruim
            deixa de enganar. Campanha com ROAS &ldquo;medíocre&rdquo; que traz cliente
            de alto LTV deixa de ser cortada. A decisão de mídia passa a ser tomada com
            o funil inteiro à vista.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-12 overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-low">
            <div className="flex items-center justify-between border-b border-outline-variant/60 px-5 py-4">
              <p className="font-heading text-sm font-semibold text-foreground">
                Verdade das Conversões
              </p>
              <span className="text-xs text-on-surface-variant">
                plataforma reportou × resultado real
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-on-surface-variant">
                  <tr className="border-b border-outline-variant/40">
                    <th className="px-5 py-3 font-medium">Campanha</th>
                    <th className="px-5 py-3 font-medium">Plataforma reporta</th>
                    <th className="px-5 py-3 font-medium">Real (CRM/pedidos)</th>
                    <th className="px-5 py-3 font-medium">Decisão do agente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {ROWS.map((row) => (
                    <tr key={row.campaign}>
                      <td className="px-5 py-4 text-foreground">{row.campaign}</td>
                      <td className="ledger-figure px-5 py-4 text-on-surface-variant">
                        {row.reported}
                      </td>
                      <td className="ledger-figure px-5 py-4 font-medium text-foreground">
                        {row.real}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={row.good ? "secondary" : "outline"}>
                          {row.decision}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 text-xs text-on-surface-variant">
            Exemplo ilustrativo do painel &ldquo;Verdade das Conversões&rdquo;.
          </p>
        </Reveal>

        <Reveal delay={200}>
          <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-sm text-on-surface-variant">Conecta com:</p>
            {INTEGRATIONS.map((name) => (
              <Badge key={name} variant="outline" className="h-7 px-3 text-sm">
                {name}
              </Badge>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
