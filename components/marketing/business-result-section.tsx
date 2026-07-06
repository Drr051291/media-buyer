"use client";

import { useEffect, useRef, useState } from "react";
import { PackageX, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/marketing/reveal";
import { useCountUp } from "@/components/marketing/use-count-up";

const INTEGRATIONS = ["Pipedrive", "RD Station", "Shopify", "Nuvemshop", "Bling", "GA4", "Make"];

const ROWS = [
  { campaign: "Prospecção — Joias", platform: "2,1x", real: 4.3, decision: "Escalar", good: true },
  { campaign: "Remarketing — Carrinho", platform: "6,8x", real: 3.0, decision: "Observar", good: false },
  { campaign: "Leadgen — B2B", platform: "CPL R$ 12", real: 4.1, decision: "Revisar", good: false },
];

function RealCell({ value, good }: { value: number; good: boolean }) {
  const { ref, display } = useCountUp(value, { decimals: 1 });
  return (
    <span
      ref={ref}
      className={
        "ledger-figure font-semibold " +
        (good
          ? "text-primary [text-shadow:0_0_16px_color-mix(in_oklch,var(--md3-primary)_35%,transparent)]"
          : "text-foreground")
      }
    >
      {display}x
    </span>
  );
}

export function BusinessResultSection() {
  return (
    <section
      id="integracoes"
      className="scroll-mt-16 border-y border-outline-variant/60 bg-surface-container-low px-margin-mobile py-24 md:px-margin-desktop"
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
            A coluna que a plataforma reporta fica <span className="text-on-surface-variant/70">apagada</span>.
            A que virou receita real, <span className="font-medium text-primary">acesa</span>. Você aprende
            a ler a conta sem ler uma linha.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {/* Tile grande — Verdade das Conversões */}
          <Reveal className="lg:col-span-2 lg:row-span-2">
            <BentoTile className="h-full">
              <div className="flex items-center justify-between border-b border-outline-variant/50 pb-3">
                <p className="font-heading text-sm font-semibold text-foreground">Verdade das Conversões</p>
                <span className="text-xs text-on-surface-variant">plataforma × real</span>
              </div>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="text-xs text-on-surface-variant">
                    <tr>
                      <th className="py-2.5 font-medium">Campanha</th>
                      <th className="py-2.5 font-medium">Plataforma</th>
                      <th className="py-2.5 font-medium">Real (CRM)</th>
                      <th className="py-2.5 text-right font-medium">Decisão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/40">
                    {ROWS.map((row) => (
                      <tr key={row.campaign}>
                        <td className="py-3 text-foreground">{row.campaign}</td>
                        <td className="ledger-figure py-3 text-on-surface-variant/70 line-through decoration-on-surface-variant/40">
                          {row.platform}
                        </td>
                        <td className="py-3">
                          <RealCell value={row.real} good={row.good} />
                        </td>
                        <td className="py-3 text-right">
                          <Badge variant={row.good ? "secondary" : "outline"}>{row.decision}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-on-surface-variant">Exemplo ilustrativo do painel.</p>
            </BentoTile>
          </Reveal>

          {/* POAS */}
          <Reveal delay={100}>
            <BentoTile>
              <p className="text-xs font-medium tracking-wide text-on-surface-variant uppercase">
                POAS · lucro sobre anúncio
              </p>
              <div className="mt-4 flex items-end gap-1.5">
                {[38, 44, 41, 52, 60, 66].map((h, i) => (
                  <span
                    key={i}
                    className="flex-1 rounded-t bg-primary/70"
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
              <p className="mt-3 text-sm text-foreground">
                Margem real, não só receita — com custo do produto vindo do ERP.
              </p>
            </BentoTile>
          </Reveal>

          {/* STOCK_RISK */}
          <Reveal delay={180}>
            <BentoTile>
              <div className="flex items-center gap-2">
                <PackageX className="size-4 text-secondary" />
                <p className="text-xs font-medium tracking-wide text-on-surface-variant uppercase">
                  Stock risk
                </p>
              </div>
              <p className="mt-3 text-sm text-foreground">
                SKU vencedor com 3 dias de estoque — o agente segura a escala antes de queimar verba.
              </p>
              <Badge variant="outline" className="mt-3">
                Budget reduzido 20%
              </Badge>
            </BentoTile>
          </Reveal>
        </div>

        {/* Jornada do lead */}
        <Reveal delay={120}>
          <LeadJourney />
        </Reveal>

        {/* Marquee de integrações */}
        <Reveal delay={160}>
          <div className="lp-marquee-group mt-10 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
            <div className="lp-marquee flex w-max gap-3">
              {[...INTEGRATIONS, ...INTEGRATIONS].map((name, i) => (
                <Badge key={i} variant="outline" className="h-8 shrink-0 px-4 text-sm">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function BentoTile({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={
        "group h-full rounded-2xl border border-outline-variant/50 bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_20px_50px_-30px_color-mix(in_oklch,var(--md3-primary)_45%,transparent)] " +
        className
      }
    >
      {children}
    </div>
  );
}

const JOURNEY = ["Anúncio", "Landing page", "CRM", "Reunião", "Venda"];

function LeadJourney() {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          if (reduce) return setLit(JOURNEY.length);
          let i = 0;
          const t = setInterval(() => {
            i += 1;
            setLit(i);
            if (i >= JOURNEY.length) clearInterval(t);
          }, 350);
        }
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="mt-4 rounded-2xl border border-outline-variant/50 bg-card p-6">
      <p className="text-xs font-medium tracking-wide text-on-surface-variant uppercase">
        A jornada inteira, não só o clique
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-3">
        {JOURNEY.map((step, i) => (
          <div key={step} className="flex items-center gap-1">
            <span
              className={
                "rounded-full border px-3 py-1.5 text-sm transition-all duration-300 " +
                (i < lit
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-outline-variant/50 bg-muted/40 text-on-surface-variant")
              }
            >
              {step}
            </span>
            {i < JOURNEY.length - 1 && (
              <ArrowRight
                className={"size-4 transition-colors " + (i + 1 < lit ? "text-primary" : "text-outline-variant")}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
