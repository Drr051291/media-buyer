import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const INTEGRATIONS = ["Pipedrive", "RD Station", "Shopify", "Nuvemshop", "Bling", "GA4", "Make"];

export function BusinessResultSection() {
  return (
    <section id="integracoes" className="scroll-mt-16 bg-surface-container-low px-margin-mobile py-20 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
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
        </div>

        <Card className="mt-10 overflow-hidden border-outline-variant/60 shadow-none">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-muted/60 text-xs text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 font-medium">Campanha</th>
                  <th className="px-4 py-3 font-medium">ROAS (Meta reporta)</th>
                  <th className="px-4 py-3 font-medium">ROAS real (CRM/pedidos)</th>
                  <th className="px-4 py-3 font-medium">Decisão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40">
                <tr>
                  <td className="px-4 py-3 text-foreground">Prospecção — Joias 25-45</td>
                  <td className="px-4 py-3 text-on-surface-variant">2,1x</td>
                  <td className="px-4 py-3 font-medium text-foreground">4,3x</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">Escalar</Badge>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-foreground">Remarketing — Carrinho</td>
                  <td className="px-4 py-3 text-on-surface-variant">6,8x</td>
                  <td className="px-4 py-3 font-medium text-foreground">3,0x</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">Manter e observar</Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
        <p className="mt-2 text-xs text-on-surface-variant">
          Exemplo ilustrativo do painel &ldquo;Verdade das Conversões&rdquo;.
        </p>

        <div className="mt-10">
          <p className="text-sm text-on-surface-variant">Conecta com:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {INTEGRATIONS.map((name) => (
              <Badge key={name} variant="outline" className="h-7 px-3 text-sm">
                {name}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
