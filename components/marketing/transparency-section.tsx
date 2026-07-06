import { CheckCircle2, TrendingDown, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/marketing/reveal";

const LEFT = [
  {
    tag: "diagnóstico",
    text: "O que mudou, desde quando e por quê — em linguagem de negócio.",
  },
  {
    tag: "evidência com números",
    text: "Cada afirmação ancorada em métrica real do período, com significância.",
  },
];
const RIGHT = [
  { tag: "impacto esperado", text: "O que a ação deve mudar, em faixa, antes de você aprovar." },
  { tag: "risco", text: "Classificado — só risco baixo é elegível a autopilot." },
  { tag: "reverter em 1 clique", text: "Todo estado anterior é guardado. Auditoria completa." },
];

function Annotation({
  tag,
  text,
  side,
  delay,
}: {
  tag: string;
  text: string;
  side: "left" | "right";
  delay: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className={"flex items-start gap-3 " + (side === "right" ? "lg:flex-row-reverse lg:text-right" : "")}>
        <span aria-hidden className="mt-2 hidden h-px w-8 shrink-0 bg-gradient-to-r from-primary/60 to-transparent lg:block" />
        <div>
          <p className="font-heading text-sm font-semibold text-primary">{tag}</p>
          <p className="mt-0.5 text-sm text-on-surface-variant">{text}</p>
        </div>
      </div>
    </Reveal>
  );
}

export function TransparencySection() {
  return (
    <section className="px-margin-mobile py-24 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Sem caixa-preta
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Cada recomendação, anatomizada
          </h2>
          <p className="mt-4 text-lg text-on-surface-variant">
            Nada de &ldquo;a IA decidiu&rdquo;. Toda ação vem desmontada em partes que você
            pode auditar — e reverter.
          </p>
        </Reveal>

        <div className="mt-14 grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex flex-col gap-8">
            {LEFT.map((item, i) => (
              <Annotation key={item.tag} {...item} side="left" delay={i * 120} />
            ))}
          </div>

          <Reveal delay={100}>
            <div className="mx-auto w-full max-w-sm rounded-2xl border border-primary/30 bg-surface-container-lowest p-5 shadow-[0_24px_60px_-30px_color-mix(in_oklch,var(--md3-primary)_45%,transparent)]">
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline" className="gap-1">
                  <TrendingDown className="size-3" />
                  Fadiga de criativo
                </Badge>
                <span className="text-xs text-on-surface-variant">Adset · Remarketing 7d</span>
              </div>
              <p className="mt-3 text-sm text-foreground">
                CPA subiu 32% em 3 dias com CTR caindo e frequência acima do limiar do modelo.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-outline-variant/50 bg-outline-variant/50">
                {[
                  { l: "CPA 3d", v: "R$ 68", n: "+32%" },
                  { l: "CTR 7d", v: "1,12%", n: "-27%" },
                  { l: "Freq.", v: "4.8", n: "alta" },
                ].map((m) => (
                  <div key={m.l} className="bg-muted/80 px-2.5 py-2">
                    <p className="text-[10px] tracking-wide text-on-surface-variant uppercase">{m.l}</p>
                    <p className="ledger-figure mt-0.5 text-sm font-medium text-foreground">{m.v}</p>
                    <p className="text-[10px] text-on-surface-variant">{m.n}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-sm text-foreground">
                  Pausar 2 anúncios e realocar 18% do budget.{" "}
                  <span className="text-on-surface-variant">Impacto: -10 a -15% no CPA · risco baixo.</span>
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <ButtonLike>Aprovar</ButtonLike>
                <span className="flex flex-1 items-center justify-center gap-1 rounded-full border border-outline-variant/60 py-1.5 text-xs text-on-surface-variant">
                  <RotateCcw className="size-3" />
                  Reverter
                </span>
              </div>
            </div>
          </Reveal>

          <div className="flex flex-col gap-8">
            {RIGHT.map((item, i) => (
              <Annotation key={item.tag} {...item} side="right" delay={i * 120} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ButtonLike({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex flex-1 items-center justify-center rounded-full bg-primary py-1.5 text-xs font-medium text-primary-foreground">
      {children}
    </span>
  );
}
