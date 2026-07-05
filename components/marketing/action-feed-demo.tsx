"use client";

import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp, SplitSquareVertical, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CARDS = [
  {
    id: "fatigue",
    icon: TrendingDown,
    severity: { label: "Crítico", variant: "destructive" as const },
    entity: "Adset · Remarketing 7d",
    signal: "Fadiga de criativo",
    finding:
      "CPA subiu 32% nos últimos 3 dias frente à média de 14 dias, com volume de conversão suficiente para significância.",
    evidence: [
      { label: "CTR 7d", value: "1,12%", note: "-27% vs. 14d" },
      { label: "Frequência", value: "4.8", note: "acima do limiar" },
      { label: "CPM", value: "R$ 23,10", note: "estável" },
    ],
    action: "Pausar 2 anúncios fatigados e realocar 18% do budget para o adset vencedor.",
    impact: "Redução estimada de 10-15% no CPA da campanha.",
  },
  {
    id: "winner",
    icon: TrendingUp,
    severity: { label: "Oportunidade", variant: "secondary" as const },
    entity: "Adset · Lookalike 3% Compradores",
    signal: "Vencedor subfinanciado",
    finding:
      "CPA 22% abaixo do alvo há 9 dias com volume estável, mas recebe só 11% do spend da campanha.",
    evidence: [
      { label: "CPA 7d", value: "R$ 35,20", note: "alvo R$ 45,00" },
      { label: "Share de spend", value: "11%", note: "da campanha" },
      { label: "Conversões 7d", value: "64", note: "com significância" },
    ],
    action: "Aumentar o budget diário em 20%, dentro do guardrail da conta.",
    impact: "Mais volume no CPA mais eficiente da conta.",
  },
  {
    id: "funnel",
    icon: SplitSquareVertical,
    severity: { label: "Atenção", variant: "outline" as const },
    entity: "Campanha · Prospecção Frio",
    signal: "Quebra de funil",
    finding:
      "CTR estável, mas a conversão pós-clique caiu 43% desde terça — provável problema de LP ou pixel, não de mídia.",
    evidence: [
      { label: "CTR 7d", value: "1,84%", note: "estável" },
      { label: "Conv. pós-clique", value: "-43%", note: "desde 01/07" },
      { label: "CPM", value: "R$ 19,40", note: "estável" },
    ],
    action: "Nenhuma mudança de mídia — verificar a LP e o pixel antes de mexer em budget.",
    impact: "Evita cortar campanha saudável por um problema fora da mídia.",
  },
];

const CYCLE_MS = 7000;

export function ActionFeedDemo() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      setActive((current) => (current + 1) % CARDS.length);
    }, CYCLE_MS);
    return () => clearInterval(timer);
  }, [paused]);

  const card = CARDS[active];

  return (
    <div
      className="w-full max-w-md"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium tracking-wide text-on-surface-variant uppercase">
          Feed de ações · hoje
        </p>
        <div className="flex gap-1.5" role="tablist" aria-label="Exemplos de ação do agente">
          {CARDS.map((item, index) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={index === active}
              aria-label={item.signal}
              onClick={() => setActive(index)}
              className={
                "h-1.5 rounded-full transition-all " +
                (index === active
                  ? "w-6 bg-primary"
                  : "w-1.5 bg-outline-variant hover:bg-outline")
              }
            />
          ))}
        </div>
      </div>

      <div
        key={card.id}
        className="lp-rise rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-[0_18px_50px_-24px_color-mix(in_oklch,var(--md3-primary)_35%,transparent)]"
      >
        <div className="flex items-center justify-between gap-3">
          <Badge variant={card.severity.variant}>{card.severity.label}</Badge>
          <span className="text-xs text-on-surface-variant">{card.entity}</span>
        </div>

        <div className="mt-4 flex items-start gap-2.5">
          <card.icon className="mt-0.5 size-4 shrink-0 text-secondary" />
          <div>
            <p className="text-xs font-semibold tracking-wide text-secondary uppercase">
              {card.signal}
            </p>
            <p className="mt-1 text-sm text-foreground">{card.finding}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-outline-variant/50 bg-outline-variant/50">
          {card.evidence.map((item) => (
            <div key={item.label} className="bg-muted/80 px-2.5 py-2.5">
              <p className="text-[10px] tracking-wide text-on-surface-variant uppercase">
                {item.label}
              </p>
              <p className="ledger-figure mt-0.5 text-sm font-medium text-foreground">
                {item.value}
              </p>
              <p className="text-[10px] text-on-surface-variant">{item.note}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm text-foreground">
            <span className="font-medium">Ação proposta:</span> {card.action}
          </p>
        </div>
        <p className="mt-2 pl-6.5 text-xs text-on-surface-variant">{card.impact}</p>

        <div className="mt-5 flex gap-2">
          <Button size="sm" className="flex-1">
            Aprovar
          </Button>
          <Button size="sm" variant="outline" className="flex-1">
            Rejeitar
          </Button>
        </div>
      </div>

      <p className="mt-3 px-1 text-xs text-on-surface-variant">
        Exemplo real do formato do feed — diagnóstico, evidência e ação, todos os dias.
      </p>
    </div>
  );
}
