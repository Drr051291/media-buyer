import { PlayCircle } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

export function SocialProofSection() {
  return (
    <section className="px-margin-mobile py-24 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Beta fechado
          </p>
          <h2 className="mt-2 max-w-2xl font-heading text-3xl font-bold text-primary md:text-4xl">
            Estamos com um grupo pequeno de founding members validando o produto
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-8 flex max-w-3xl flex-col items-start gap-4 rounded-2xl border border-dashed border-outline-variant bg-card p-8 sm:flex-row sm:items-center sm:gap-6">
            <PlayCircle className="size-10 shrink-0 text-secondary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Vídeo de demonstração (90s) em produção
              </p>
              <p className="mt-1 text-sm text-on-surface-variant">
                Depoimentos e resultados reais entram aqui assim que os primeiros
                founding members tiverem histórico suficiente na plataforma.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
