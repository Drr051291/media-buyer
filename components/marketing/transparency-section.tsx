import { FileSearch, History, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

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

export function TransparencySection() {
  return (
    <section className="px-margin-mobile py-20 md:px-margin-desktop">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
        <div>
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
          <ul className="mt-8 grid gap-4">
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
        </div>

        <Card className="border-outline-variant/60 shadow-none">
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="font-heading text-sm font-semibold text-foreground">
              Diagnóstico expandido — Campanha &ldquo;Remarketing 30d&rdquo;
            </p>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 p-4 text-xs text-on-surface-variant">
              <div>
                <p className="text-foreground">CPA (3d)</p>
                <p className="mt-1 font-heading text-lg font-semibold text-destructive">R$ 68,40</p>
                <p>vs. R$ 51,80 (14d)</p>
              </div>
              <div>
                <p className="text-foreground">CTR (7d)</p>
                <p className="mt-1 font-heading text-lg font-semibold text-foreground">1,12%</p>
                <p>-27% vs. 14d anteriores</p>
              </div>
              <div>
                <p className="text-foreground">Frequência</p>
                <p className="mt-1 font-heading text-lg font-semibold text-foreground">4.8</p>
                <p>acima do limiar do modelo</p>
              </div>
              <div>
                <p className="text-foreground">Conversões (14d)</p>
                <p className="mt-1 font-heading text-lg font-semibold text-foreground">86</p>
                <p>volume com significância</p>
              </div>
            </div>
            <p className="text-on-surface-variant">
              Diagnóstico: queda de CTR com CPM estável indica fadiga de criativo, não
              pressão de leilão. Impacto esperado da ação: redução estimada de 10-15%
              no CPA da campanha.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
