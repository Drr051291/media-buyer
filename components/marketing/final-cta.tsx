import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/marketing/reveal";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden px-margin-mobile py-28 text-center md:px-margin-desktop">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[360px] bg-[radial-gradient(ellipse_at_bottom,color-mix(in_oklch,var(--md3-secondary-container)_30%,transparent),transparent_65%)]"
      />
      <Reveal className="relative mx-auto flex max-w-3xl flex-col items-center gap-7">
        <h2 className="text-balance font-heading text-4xl font-bold text-primary md:text-5xl">
          Sua próxima conta não precisa de mais uma{" "}
          <em className="italic">madrugada</em> sua
        </h2>
        <Button
          size="lg"
          className="h-12 px-6 text-base"
          render={<Link href="/signup" data-analytics-event="click_cta_final" />}
        >
          Começar grátis
          <ArrowRight className="size-4" data-icon="inline-end" />
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <Lock className="size-3" />
          Conecte em modo somente-leitura. Sem cartão de crédito.
        </p>
      </Reveal>
    </section>
  );
}
