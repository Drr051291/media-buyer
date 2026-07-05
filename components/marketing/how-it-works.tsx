import { Plug, SlidersHorizontal, ClipboardCheck } from "lucide-react";

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
    <section id="como-funciona" className="scroll-mt-16 px-margin-mobile py-20 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Como funciona
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Do token ao primeiro diagnóstico, em três passos
          </h2>
        </div>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="artisanal-card flex flex-col gap-4 rounded-2xl border border-outline-variant/50 bg-card p-6"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {index + 1}
                </span>
                <step.icon className="size-5 text-secondary" />
              </div>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="text-sm text-on-surface-variant">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
