import { Reveal } from "@/components/marketing/reveal";

const PAINS = [
  "Horas por dia pulando entre Ads Manager, Google Ads e planilhas, conta por conta.",
  "Decisão no feeling porque não dá tempo de cruzar campanha com o que virou venda.",
  'Cliente perguntando "por que o CPA subiu?" antes de você saber que subiu.',
];

export function PainBar() {
  return (
    <section className="border-y border-outline-variant/60 bg-surface-container-low">
      <div className="mx-auto max-w-7xl px-margin-mobile py-14 md:px-margin-desktop">
        <Reveal>
          <p className="max-w-md font-heading text-2xl font-medium text-balance text-foreground italic">
            Você sabe o que acontece quando a carteira cresce:
          </p>
        </Reveal>
        <div className="mt-8 grid gap-x-10 gap-y-6 md:grid-cols-3">
          {PAINS.map((pain, index) => (
            <Reveal key={pain} delay={index * 100}>
              <p className="border-l-2 border-secondary/50 pl-4 text-sm leading-relaxed text-on-surface-variant">
                {pain}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
