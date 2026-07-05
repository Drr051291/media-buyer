import Link from "next/link";
import { ArrowRight, TrendingDown, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-margin-mobile pt-16 pb-20 md:px-margin-desktop md:pt-24 md:pb-28">
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col items-start gap-6 text-left">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Gestão de mídia com IA · orientada a resultado
          </p>
          <h1 className="max-w-xl text-balance font-heading text-4xl font-bold tracking-tight text-primary md:text-5xl">
            A IA que gerencia suas mídias olhando o que importa: venda, não só CPA
          </h1>
          <p className="max-w-lg text-lg text-on-surface-variant">
            O Traffic Copilot analisa suas campanhas todos os dias, cruza com seu CRM,
            e-commerce e GA4 para saber o que virou receita, e propõe ações com
            diagnóstico, evidência e impacto esperado. Você aprova — ou deixa no
            automático com limites que você define.
          </p>

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant">
            <Badge variant="secondary">Meta Ads disponível agora</Badge>
            <Badge variant="outline">Google Ads em breve</Badge>
            <Badge variant="outline">TikTok em breve</Badge>
          </div>

          <div className="flex flex-col items-start gap-2">
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                render={<Link href="/signup" data-analytics-event="click_cta_hero" />}
              >
                Começar grátis
                <ArrowRight className="size-4" data-icon="inline-end" />
              </Button>
              <Button size="lg" variant="outline" render={<a href="#como-funciona" />}>
                Ver como funciona
              </Button>
            </div>
            <p className="text-xs text-on-surface-variant">
              Conecte em modo somente-leitura. Sem cartão de crédito.
            </p>
          </div>
        </div>

        <Card className="artisanal-card paper-texture w-full max-w-md justify-self-center border-outline-variant/60 shadow-none">
          <CardHeader className="gap-2">
            <div className="flex items-center justify-between">
              <Badge variant="destructive">Prioridade alta</Badge>
              <span className="text-xs text-on-surface-variant">Adset · Remarketing 7d</span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start gap-2">
              <TrendingDown className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-sm text-foreground">
                CPA subiu 32% nos últimos 3 dias frente à média de 14 dias, com volume
                de conversão suficiente para significância.
              </p>
            </div>
            <div className="rounded-lg bg-muted/60 p-3 text-xs text-on-surface-variant">
              <p className="font-medium text-foreground">Evidência</p>
              <p className="mt-1">
                CTR caiu 27% vs. 14d anteriores · frequência em 4.8 · CPM estável — indício
                de fadiga de criativo, não de leilão.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm text-foreground">
                <span className="font-medium">Ação proposta:</span> pausar 2 anúncios
                fatigados e realocar 18% do budget para o adset vencedor.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="flex-1">
                Aprovar
              </Button>
              <Button size="sm" variant="outline" className="flex-1">
                Ver detalhes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
