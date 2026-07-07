import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/marketing/reveal";
import { SignatureDivider } from "@/components/marketing/signature-divider";

export function FinalCta() {
  return (
    <section className="px-margin-mobile pt-8 pb-28 text-center md:px-margin-desktop">
      <SignatureDivider amplified />
      <Reveal className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-7">
        <h2 className="text-balance font-heading text-4xl font-bold text-primary md:text-5xl">
          Sua próxima conta não precisa de mais uma <em className="italic">madrugada</em> sua
        </h2>
        <div className="flex flex-col items-center gap-2">
          <Button
            size="lg"
            className="h-12 px-6 text-base"
            render={<Link href="/signup" data-analytics-event="click_cta_final" />}
          >
            Começar grátis
            <ArrowRight className="size-4" data-icon="inline-end" />
          </Button>
          {/* a linha "real" da assinatura sublinha o botão */}
          <span aria-hidden className="h-0.5 w-40 rounded-full bg-primary/70" />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <Lock className="size-3" />
          Conecte em modo somente-leitura. Sem cartão de crédito.
        </p>
      </Reveal>
    </section>
  );
}
