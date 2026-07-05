import { User, Users, Building2 } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

const PERSONAS = [
  {
    icon: User,
    title: "Gestor de tráfego solo",
    description: "Opere como um time. Mais contas e mais canais, mesma agenda.",
  },
  {
    icon: Users,
    title: "Agências",
    description:
      "Padrão de análise sênior em toda a carteira, do júnior ao head. Relatórios de resultado prontos para o cliente.",
  },
  {
    icon: Building2,
    title: "Times de mídia in-house",
    description: "Monitoramento contínuo e resposta rápida, sem crescer o headcount.",
  },
];

export function PersonasSection() {
  return (
    <section className="border-y border-outline-variant/60 bg-surface-container-low px-margin-mobile py-24 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Para quem é
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Feito para quem opera mídia como profissão
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PERSONAS.map((persona, index) => (
            <Reveal key={persona.title} delay={index * 100}>
              <div className="artisanal-card h-full rounded-2xl border border-outline-variant/50 bg-card p-6">
                <persona.icon className="size-5 text-secondary" />
                <h3 className="mt-3 font-heading text-lg font-semibold text-foreground">
                  {persona.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  {persona.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
