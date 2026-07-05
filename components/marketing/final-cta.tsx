import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="px-margin-mobile py-24 text-center md:px-margin-desktop">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
        <h2 className="font-heading text-3xl font-bold text-primary md:text-4xl">
          Sua próxima conta não precisa de mais uma madrugada sua
        </h2>
        <Button
          size="lg"
          render={<Link href="/signup" data-analytics-event="click_cta_final" />}
        >
          Começar grátis
          <ArrowRight className="size-4" data-icon="inline-end" />
        </Button>
        <p className="text-xs text-on-surface-variant">
          Conecte em modo somente-leitura. Sem cartão de crédito.
        </p>
      </div>
    </section>
  );
}
