"use client";

import { useEffect, useRef, useState } from "react";
import { Plug, SlidersHorizontal, ClipboardCheck, Check } from "lucide-react";

const STEPS = [
  {
    icon: Plug,
    title: "Conecte",
    description:
      "Conecte suas contas de mídia e suas fontes de resultado — CRM, e-commerce, ERP, GA4 — em minutos. Comece em modo somente-leitura, sem dar permissão de escrita até confiar.",
  },
  {
    icon: SlidersHorizontal,
    title: "Contextualize",
    description:
      "Informe o que importa em cada conta: ticket médio, margem, CPA alvo, restrições. A IA analisa com o contexto do negócio — não com benchmark genérico.",
  },
  {
    icon: ClipboardCheck,
    title: "Aprove (ou automatize)",
    description:
      "Todo dia, um feed de ações priorizadas: o que fazer, por quê, e o impacto esperado. Aprove com um clique ou ative o autopilot com guardrails.",
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.idx);
            setActive(idx);
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    panelRefs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="como-funciona" className="scroll-mt-16 px-margin-mobile py-24 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Como funciona
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Do token ao primeiro diagnóstico, em três passos
          </h2>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          {/* Coluna esquerda — sticky no desktop, com barra de progresso */}
          <div className="hidden lg:block">
            <div className="sticky top-28 flex gap-5">
              <div className="relative w-px bg-outline-variant/60">
                <div
                  className="absolute left-0 w-px bg-primary transition-all duration-500"
                  style={{ height: `${((active + 1) / STEPS.length) * 100}%` }}
                />
              </div>
              <ol className="flex flex-col gap-8">
                {STEPS.map((step, index) => {
                  const on = index === active;
                  return (
                    <li
                      key={step.title}
                      className={"flex flex-col gap-2 transition-opacity duration-300 " + (on ? "opacity-100" : "opacity-40")}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={
                            "ledger-figure flex size-9 items-center justify-center rounded-full border text-sm font-medium transition-colors " +
                            (on ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant")
                          }
                        >
                          {index + 1}
                        </span>
                        <step.icon className={"size-5 " + (on ? "text-secondary" : "text-on-surface-variant")} />
                        <h3 className="font-heading text-xl font-semibold text-foreground">{step.title}</h3>
                      </div>
                      <p className="max-w-sm pl-12 text-sm leading-relaxed text-on-surface-variant">
                        {step.description}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          {/* Coluna direita — visuais que trocam com o scroll (desktop) */}
          <div className="hidden flex-col lg:flex">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                data-idx={index}
                ref={(node) => {
                  panelRefs.current[index] = node;
                }}
                className="flex min-h-[58vh] items-center"
              >
                <StepVisual index={index} active={index === active} />
              </div>
            ))}
          </div>

          {/* Mobile — pares empilhados (passo + visual) */}
          <div className="flex flex-col gap-10 lg:hidden">
            {STEPS.map((step, index) => (
              <div key={step.title} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="ledger-figure flex size-9 items-center justify-center rounded-full border border-primary bg-primary/10 text-sm font-medium text-primary">
                    {index + 1}
                  </span>
                  <step.icon className="size-5 text-secondary" />
                  <h3 className="font-heading text-lg font-semibold text-foreground">{step.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-on-surface-variant">{step.description}</p>
                <StepVisual index={index} active />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Panel({ children, active }: { children: React.ReactNode; active: boolean }) {
  return (
    <div
      className={
        "w-full rounded-2xl border border-outline-variant/50 bg-card p-6 transition-all duration-500 " +
        (active ? "opacity-100 shadow-[0_20px_50px_-30px_color-mix(in_oklch,var(--md3-primary)_40%,transparent)]" : "opacity-60")
      }
    >
      {children}
    </div>
  );
}

function StepVisual({ index, active }: { index: number; active: boolean }) {
  if (index === 0) {
    const sources = ["Meta Ads", "Pipedrive", "Shopify", "GA4"];
    return (
      <Panel active={active}>
        <p className="text-xs font-medium tracking-wide text-on-surface-variant uppercase">
          Conexões
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {sources.map((src, i) => (
            <div
              key={src}
              className="flex items-center justify-between rounded-lg border border-outline-variant/50 bg-muted/60 px-3 py-2.5 text-sm"
              style={active ? { animation: `lp-rise 0.5s ease ${i * 90}ms both` } : undefined}
            >
              <span className="text-foreground">{src}</span>
              <Check className="size-4 text-primary" />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-center text-sm font-medium text-primary">
          Token validado · modo somente-leitura
        </div>
      </Panel>
    );
  }
  if (index === 1) {
    const fields = [
      { k: "Ticket médio", v: "R$ 180" },
      { k: "Margem bruta", v: "55%" },
      { k: "CPA alvo", v: "R$ 45" },
    ];
    return (
      <Panel active={active}>
        <p className="text-xs font-medium tracking-wide text-on-surface-variant uppercase">
          Contexto do negócio
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          {fields.map((f, i) => (
            <div
              key={f.k}
              className="flex items-center justify-between rounded-lg border border-outline-variant/50 bg-muted/60 px-3 py-2.5 text-sm"
              style={active ? { animation: `lp-rise 0.5s ease ${i * 90}ms both` } : undefined}
            >
              <span className="text-on-surface-variant">{f.k}</span>
              <span className="ledger-figure font-medium text-foreground">{f.v}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
          <span className="text-on-surface-variant">CPA breakeven recalculado</span>
          <span className="ledger-figure font-semibold text-primary">R$ 99</span>
        </div>
      </Panel>
    );
  }
  const modes = ["Observador", "Copiloto", "Autopilot"];
  return (
    <Panel active={active}>
      <p className="text-xs font-medium tracking-wide text-on-surface-variant uppercase">
        Autonomia da conta
      </p>
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-full border border-outline-variant/50 bg-muted/60 p-1 text-xs font-medium">
        {modes.map((mode, i) => (
          <span
            key={mode}
            className={
              "rounded-full py-1.5 text-center transition-colors " +
              (i === 1 ? "bg-primary text-primary-foreground" : "text-on-surface-variant")
            }
          >
            {mode}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-outline-variant/50 bg-muted/60 p-3">
        <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-sm text-foreground">
          Ação aprovada com um clique — ou executada sozinha se estiver dentro dos guardrails.
        </p>
      </div>
    </Panel>
  );
}
