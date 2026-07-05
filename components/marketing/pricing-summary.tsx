import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PLANS = [
  {
    name: "Starter",
    description: "Para quem está começando a escalar a carteira.",
    features: ["Poucas contas conectadas", "Feed de insights diário", "Modo Copiloto"],
  },
  {
    name: "Pro",
    description: "Para gestores com carteira em crescimento.",
    features: [
      "Mais contas conectadas",
      "Integrações de CRM/e-commerce/GA4",
      "Autopilot para ações de baixo risco",
    ],
    highlighted: true,
  },
  {
    name: "Agência",
    description: "Para agências com múltiplos clientes e times.",
    features: ["Contas ilimitadas por carteira", "Relatórios de resultado por cliente", "Múltiplos membros de equipe"],
  },
];

export function PricingSummary() {
  return (
    <section id="precos" className="scroll-mt-16 px-margin-mobile py-20 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Preços
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Um plano para cada tamanho de carteira
          </h2>
          <p className="mt-4 text-lg text-on-surface-variant">
            Cobrança por conta de anúncio conectada, com fair use de análises de IA.
            Valores finais e planos completos em{" "}
            <span className="font-medium text-foreground">/precos</span>.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <Card
              key={plan.name}
              className={
                "flex flex-col shadow-none " +
                (plan.highlighted ? "border-primary/50 ring-1 ring-primary/30" : "border-outline-variant/60")
              }
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-xl">
                  {plan.name}
                  {plan.highlighted && <Badge>Mais popular</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="text-sm text-on-surface-variant">{plan.description}</p>
                <ul className="flex flex-1 flex-col gap-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-2"
                  variant={plan.highlighted ? "default" : "outline"}
                  render={<Link href="/signup" />}
                >
                  Começar grátis
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-8 text-center text-sm font-medium text-secondary">
          Founding members: 50% off vitalício para os 30 primeiros (enquanto valer).
        </p>
      </div>
    </section>
  );
}
