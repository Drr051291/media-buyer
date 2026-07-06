"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/marketing/reveal";
import { usePrefersReducedMotion } from "@/components/marketing/use-prefers-reduced-motion";

const PLANS = [
  {
    name: "Starter",
    monthly: 149,
    annual: 124,
    description: "Para quem está começando a escalar a carteira.",
    features: ["Poucas contas conectadas", "Feed de insights diário", "Modo Copiloto"],
  },
  {
    name: "Pro",
    monthly: 349,
    annual: 291,
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
    monthly: 899,
    annual: 749,
    description: "Para agências com múltiplos clientes e times.",
    features: [
      "Contas ilimitadas por carteira",
      "Relatórios de resultado por cliente",
      "Múltiplos membros de equipe",
    ],
  },
];

function MorphPrice({ value }: { value: number }) {
  const reduce = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (reduce) return; // render usa `value` diretamente abaixo
    const from = fromRef.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 450);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);

  return (
    <span className="ledger-figure text-3xl font-semibold text-foreground">
      R$ {reduce ? value : display}
    </span>
  );
}

export function PricingSummary() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="precos" className="scroll-mt-16 px-margin-mobile py-24 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <Reveal className="max-w-2xl">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Preços
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Um plano para cada tamanho de carteira
          </h2>
          <p className="mt-4 text-lg text-on-surface-variant">
            Cobrança por conta de anúncio conectada, com fair use de análises de IA.
          </p>
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-outline-variant/60 bg-card p-1 text-sm">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={"rounded-full px-4 py-1.5 font-medium transition-colors " + (!annual ? "bg-primary text-primary-foreground" : "text-on-surface-variant")}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={"flex items-center gap-1.5 rounded-full px-4 py-1.5 font-medium transition-colors " + (annual ? "bg-primary text-primary-foreground" : "text-on-surface-variant")}
            >
              Anual
              <span className={"text-xs " + (annual ? "text-primary-foreground/80" : "text-primary")}>-2 meses</span>
            </button>
          </div>
        </Reveal>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan, index) => (
            <Reveal key={plan.name} delay={index * 100} className="h-full">
              <div
                className={
                  "flex h-full flex-col gap-4 rounded-2xl border bg-card p-7 transition-transform duration-200 hover:-translate-y-0.5 " +
                  (plan.highlighted ? "border-primary/50 ring-1 ring-primary/30" : "border-outline-variant/50")
                }
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-xl font-semibold text-foreground">{plan.name}</h3>
                  {plan.highlighted && <Badge>Mais popular</Badge>}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <MorphPrice value={annual ? plan.annual : plan.monthly} />
                  <span className="text-sm text-on-surface-variant">/mês</span>
                </div>
                <p className="text-sm text-on-surface-variant">{plan.description}</p>
                <ul className="flex flex-1 flex-col gap-2.5">
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
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200}>
          <p className="mt-8 text-center text-sm font-medium text-secondary">
            Founding members: 50% off vitalício para os 30 primeiros (enquanto valer).
          </p>
          <p className="mt-1 text-center text-xs text-on-surface-variant">
            * Valores ilustrativos durante o beta — planos e preços finais em breve na página de preços.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
