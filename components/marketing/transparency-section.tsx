import { FileSearch, History, RotateCcw } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

const POINTS = [
  {
    icon: FileSearch,
    title: "Diagnóstico completo",
    description: "Quais métricas mudaram, desde quando, e com que significância.",
  },
  {
    icon: History,
    title: "O agente aprende com você",
    description: "Se você rejeitar uma ação, o motivo vira preferência para as próximas análises.",
  },
  {
    icon: RotateCcw,
    title: "Auditoria e reversão",
    description: "Toda ação executada fica registrada, com reversão em um clique.",
  },
];

const EVIDENCE = [
  { label: "CPA (3d)", value: "R$ 68,40", note: "vs. R$ 51,80 na média 14d", alert: true },
  { label: "CTR (7d)", value: "1,12%", note: "-27% vs. 14d anteriores", alert: false },
  { label: "Frequência", value: "4.8", note: "acima do limiar do modelo", alert: false },
  { label: "Conversões (14d)", value: "86", note: "volume com significância", alert: false },
];

export function TransparencySection() {
  return (
    <section className="border-t border-outline-variant/60 bg-surface-container-low px-margin-mobile py-24 md:px-margin-desktop">
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
        <Reveal>
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Sem caixa-preta
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            IA que mostra o trabalho, não uma caixa-preta
          </h2>
          <p className="mt-4 text-lg text-on-surface-variant">
            Cada recomendação vem com o diagnóstico completo: quais métricas mudaram,
            desde quando, com que significância — e o que esperar da ação. Se você
            rejeitar, o agente aprende sua preferência. Auditoria completa de tudo que
            foi executado, com reversão em um clique.
          </p>
          <ul className="mt-8 grid gap-5">
            {POINTS.map((point) => (
              <li key={point.title} className="flex items-start gap-3">
                <point.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">{point.title}</p>
                  <p className="text-sm text-on-surface-variant">{point.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120}>
          <div className="rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-6">
            <p className="font-heading text-sm font-semibold text-foreground">
              Diagnóstico expandido — Campanha &ldquo;Remarketing 30d&rdquo;
            </p>
            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-outline-variant/50 bg-outline-variant/50">
              {EVIDENCE.map((item) => (
                <div key={item.label} className="bg-muted/70 p-4">
                  <p className="text-[11px] tracking-wide text-on-surface-variant uppercase">
                    {item.label}
                  </p>
                  <p
                    className={
                      "ledger-figure mt-1 text-xl font-medium " +
                      (item.alert ? "text-destructive" : "text-foreground")
                    }
                  >
                    {item.value}
                  </p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">{item.note}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
              Diagnóstico: queda de CTR com CPM estável indica fadiga de criativo, não
              pressão de leilão. Impacto esperado da ação: redução estimada de 10-15%
              no CPA da campanha.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
