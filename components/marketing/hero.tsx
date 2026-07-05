import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionFeedDemo } from "@/components/marketing/action-feed-demo";

const CHANNELS = [
  { name: "Meta Ads", live: true },
  { name: "Google Ads", live: false },
  { name: "TikTok", live: false },
];

function riseDelay(ms: number) {
  return { "--rise-delay": `${ms}ms` } as React.CSSProperties;
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--md3-secondary-container)_28%,transparent),transparent_65%)]"
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-margin-mobile pt-16 pb-20 md:px-margin-desktop md:pt-24 md:pb-28 lg:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col items-start gap-6 text-left">
          <p
            className="lp-rise font-heading text-sm font-semibold tracking-wider text-secondary uppercase"
            style={riseDelay(0)}
          >
            Gestão de mídia com IA · orientada a resultado
          </p>
          <h1
            className="lp-rise max-w-xl text-balance font-heading text-4xl font-bold tracking-tight text-primary md:text-[3.4rem] md:leading-[1.08]"
            style={riseDelay(80)}
          >
            A IA que gerencia suas mídias olhando o que importa:{" "}
            <em className="font-heading italic">venda</em>, não só CPA
          </h1>
          <p
            className="lp-rise max-w-lg text-lg text-on-surface-variant"
            style={riseDelay(160)}
          >
            O Traffic Copilot analisa suas campanhas todos os dias, cruza com seu CRM,
            e-commerce e GA4 para saber o que virou receita, e propõe ações com
            diagnóstico, evidência e impacto esperado. Você aprova — ou deixa no
            automático com limites que você define.
          </p>

          <div className="lp-rise flex flex-col items-start gap-2.5" style={riseDelay(240)}>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                className="h-11 px-5 text-base"
                render={<Link href="/signup" data-analytics-event="click_cta_hero" />}
              >
                Começar grátis
                <ArrowRight className="size-4" data-icon="inline-end" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 px-5 text-base"
                render={<a href="#como-funciona" />}
              >
                Ver como funciona
              </Button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
              <Lock className="size-3" />
              Conecte em modo somente-leitura. Sem cartão de crédito.
            </p>
          </div>

          <div
            className="lp-rise flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-outline-variant/60 pt-4 text-sm"
            style={riseDelay(320)}
          >
            {CHANNELS.map((channel) => (
              <span key={channel.name} className="flex items-center gap-1.5">
                <span
                  className={
                    "size-1.5 rounded-full " +
                    (channel.live ? "bg-primary" : "border border-outline bg-transparent")
                  }
                />
                <span className={channel.live ? "font-medium text-foreground" : "text-on-surface-variant"}>
                  {channel.name}
                </span>
                {!channel.live && (
                  <span className="text-xs text-on-surface-variant">em breve</span>
                )}
              </span>
            ))}
          </div>
        </div>

        <div className="lp-rise justify-self-center lg:justify-self-end" style={riseDelay(200)}>
          <ActionFeedDemo />
        </div>
      </div>
    </section>
  );
}
