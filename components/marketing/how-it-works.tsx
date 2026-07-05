import { Plug, SlidersHorizontal, ClipboardCheck } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

const STEPS = [
  {
    icon: Plug,
    title: "Conecte",
    description:
      "Conecte suas contas de mídia (Meta Ads hoje; Google Ads e TikTok em breve) e suas fontes de resultado — CRM, e-commerce, ERP, GA4 — em minutos. Comece em modo somente-leitura, sem dar permissão de escrita até confiar.",
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
  return (
    <section id="como-funciona" className="scroll-mt-16 px-margin-mobile py-24 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <Reveal className="max-w-2xl">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Como funciona
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Do token ao primeiro diagnóstico, em três passos
          </h2>
        </Reveal>

        <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          <div
            aria-hidden
            className="absolute top-5 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-outline-variant via-outline to-outline-variant md:block"
          />
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 120}>
              <li className="relative flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="ledger-figure relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-outline-variant bg-surface text-sm font-medium text-primary">
                    {index + 1}
                  </span>
                  <step.icon className="size-5 text-secondary" />
                </div>
                <h3 className="font-heading text-xl font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-on-surface-variant">
                  {step.description}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
