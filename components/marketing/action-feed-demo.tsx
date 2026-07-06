"use client";

import { useEffect, useRef, useState } from "react";
import {
  MousePointer2,
  TrendingDown,
  PackageX,
  Radar,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/components/marketing/use-prefers-reduced-motion";

type Scenario = {
  id: string;
  tag: string;
  icon: typeof TrendingDown;
  entity: string;
  diagnosis: string;
  /** métrica que cai (sparkline) + a barra vazia (o que realmente importa) */
  fallLabel: string;
  fallSeries: number[];
  emptyLabel: string;
  action: string;
  budgetFrom: number;
  budgetTo: number;
  payoff: { label: string; platform: string; real: number; decimals?: number };
};

const SCENARIOS: Scenario[] = [
  {
    id: "leadgen",
    tag: "Leadgen · quebra de funil",
    icon: TrendingDown,
    entity: "Conjunto · Remarketing 7d",
    diagnosis:
      "CPL caiu 18%, mas nenhuma reunião marcada nos últimos 9 dias — lead barato não virou pipeline.",
    fallLabel: "CPL",
    fallSeries: [22, 20, 19, 17, 15, 14, 13],
    emptyLabel: "Reuniões",
    action: "Pausar o conjunto e realocar budget para o público que gera reunião.",
    budgetFrom: 120,
    budgetTo: 96,
    payoff: { label: "CAC", platform: "R$ 41", real: 890, decimals: 0 },
  },
  {
    id: "ecommerce",
    tag: "E-commerce · risco de estoque",
    icon: PackageX,
    entity: "Campanha · Escala — Anéis",
    diagnosis:
      "ROAS forte, mas o SKU vencedor tem 3 dias de estoque. Escalar agora queima verba em ruptura.",
    fallLabel: "Estoque (un.)",
    fallSeries: [90, 74, 58, 40, 27, 16, 9],
    emptyLabel: "Reposição",
    action: "Reduzir budget 20% até a reposição e proteger o SKU sem estoque.",
    budgetFrom: 300,
    budgetTo: 240,
    payoff: { label: "ROAS", platform: "6,8", real: 3.0, decimals: 1 },
  },
  {
    id: "tracking",
    tag: "Atribuição · verdade dos números",
    icon: Radar,
    entity: "Campanha · Prospecção fria",
    diagnosis:
      "A Meta reivindica 2,1x de ROAS; cruzando com o CRM, as vendas reais entregam bem mais.",
    fallLabel: "ROAS Meta",
    fallSeries: [2.4, 2.3, 2.2, 2.1, 2.1, 2.0, 2.1],
    emptyLabel: "Vendas CRM",
    action: "Manter e escalar — a campanha traz cliente de alto LTV que a plataforma não vê.",
    budgetFrom: 150,
    budgetTo: 180,
    payoff: { label: "ROAS", platform: "2,1", real: 4.3, decimals: 1 },
  },
];

// Fases: -1 poster (SSR/estático) · 0 diagnóstico · 1 evidência · 2 ação
// 3 clique-fantasma · 4 execução · 5 desfecho (dois números)
const DURATIONS = [2400, 1500, 1500, 1000, 2000, 3000];

export function ActionFeedDemo() {
  const [scenario, setScenario] = useState(0);
  const [phase, setPhase] = useState(-1);
  const [typed, setTyped] = useState(0);
  const [budget, setBudget] = useState(SCENARIOS[0].budgetTo);
  const [paused, setPaused] = useState(false);
  const reduce = usePrefersReducedMotion();
  const startedRef = useRef(false);

  const s = SCENARIOS[scenario];

  // Monta pós-idle para não competir com o LCP (H1 texto puro).
  useEffect(() => {
    if (reduce) return;
    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      setPhase(0);
    };
    const ric = (
      window as unknown as { requestIdleCallback?: (cb: () => void) => number }
    ).requestIdleCallback;
    const id = ric ? ric(start) : window.setTimeout(start, 400);
    return () => {
      if (!ric) clearTimeout(id as number);
    };
  }, [reduce]);

  // Modo reduzido: alterna cenários em crossfade lento, tudo visível.
  useEffect(() => {
    if (!reduce) return;
    const t = setInterval(() => setScenario((i) => (i + 1) % SCENARIOS.length), 6000);
    return () => clearInterval(t);
  }, [reduce]);

  // Timeline principal.
  useEffect(() => {
    if (reduce || paused || phase < 0) return;

    if (phase === 0) {
      // Digitação via rAF: o primeiro frame já zera `typed` (elapsed ~0),
      // sem precisar de um setState síncrono no corpo do effect.
      const t0 = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const chars = Math.min(s.diagnosis.length, Math.floor((now - t0) / 13));
        setTyped(chars);
        if (chars < s.diagnosis.length) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      const next = setTimeout(() => setPhase(1), DURATIONS[0]);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(next);
      };
    }

    if (phase === 4) {
      const t0 = performance.now();
      let raf = 0;
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / 1200);
        const eased = 1 - Math.pow(1 - t, 3);
        setBudget(s.budgetFrom + (s.budgetTo - s.budgetFrom) * eased);
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      const next = setTimeout(() => setPhase(5), DURATIONS[4]);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(next);
      };
    }

    if (phase === 5) {
      const next = setTimeout(() => {
        setScenario((i) => (i + 1) % SCENARIOS.length);
        setPhase(0);
      }, DURATIONS[5]);
      return () => clearTimeout(next);
    }

    const next = setTimeout(() => setPhase((p) => p + 1), DURATIONS[phase]);
    return () => clearTimeout(next);
  }, [phase, scenario, paused, reduce, s]);

  const poster = phase === -1;
  const show = (from: number) => reduce || poster || phase >= from;
  const diagnosisText = reduce || poster || phase > 0 ? s.diagnosis : s.diagnosis.slice(0, typed);
  const payoff = !reduce && phase === 5;

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
        <div className="flex gap-1.5" role="tablist" aria-label="Cenários do agente">
          {SCENARIOS.map((item, index) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={index === scenario}
              aria-label={item.tag}
              onClick={() => {
                setScenario(index);
                setPhase(reduce ? -1 : 0);
              }}
              className={
                "h-1.5 rounded-full transition-all " +
                (index === scenario ? "w-6 bg-primary" : "w-1.5 bg-outline-variant hover:bg-outline")
              }
            />
          ))}
        </div>
      </div>

      <div
        key={s.id}
        className="lp-rise relative overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-[0_18px_50px_-24px_color-mix(in_oklch,var(--md3-primary)_35%,transparent)]"
      >
        {/* Desfecho: os dois números gigantes */}
        <div
          className={
            "absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-surface-container-lowest px-6 text-center transition-opacity duration-500 " +
            (payoff ? "opacity-100" : "pointer-events-none opacity-0")
          }
          aria-hidden={!payoff}
        >
          <p className="text-xs font-medium tracking-wider text-on-surface-variant uppercase">
            {s.tag.split(" · ")[0]} · resultado real
          </p>
          <div className="flex items-center gap-5">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] tracking-wider text-on-surface-variant/60 uppercase">
                {s.payoff.label} plataforma
              </span>
              <span className="ledger-figure text-3xl text-on-surface-variant/50 line-through">
                {s.payoff.platform}
              </span>
            </div>
            <span className="text-on-surface-variant/40">→</span>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] tracking-wider text-primary/80 uppercase">
                {s.payoff.label} real
              </span>
              <PayoffNumber value={s.payoff.real} decimals={s.payoff.decimals ?? 1} active={payoff} />
            </div>
          </div>
        </div>

        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3">
          <Badge variant="outline" className="gap-1">
            <s.icon className="size-3" />
            {s.tag}
          </Badge>
          <span className="text-xs text-on-surface-variant">{s.entity}</span>
        </div>

        {/* Diagnóstico (digita) */}
        <p className="mt-4 min-h-[3.5rem] text-sm text-foreground">
          {diagnosisText}
          {!reduce && !poster && phase === 0 && typed < s.diagnosis.length && (
            <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-primary align-middle" />
          )}
        </p>

        {/* Evidência: a métrica que cai × a barra vazia */}
        <div
          className={
            "mt-4 grid grid-cols-2 gap-3 transition-all duration-500 " +
            (show(1) ? "opacity-100" : "translate-y-1 opacity-0")
          }
        >
          <div className="rounded-lg border border-outline-variant/50 bg-muted/70 p-3">
            <p className="text-[10px] tracking-wide text-on-surface-variant uppercase">
              {s.fallLabel}
            </p>
            <Sparkline series={s.fallSeries} active={show(1)} />
          </div>
          <div className="rounded-lg border border-outline-variant/50 bg-muted/70 p-3">
            <p className="text-[10px] tracking-wide text-on-surface-variant uppercase">
              {s.emptyLabel}
            </p>
            <div className="mt-3 flex h-8 items-end gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="h-1.5 flex-1 rounded-full bg-outline-variant/60" />
              ))}
            </div>
            <p className="mt-1 text-[10px] text-on-surface-variant">sem volume</p>
          </div>
        </div>

        {/* Ação proposta + botões (+ cursor-fantasma) */}
        <div
          className={
            "relative mt-4 transition-all duration-500 " +
            (show(2) ? "opacity-100" : "translate-y-1 opacity-0")
          }
        >
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm text-foreground">
              <span className="font-medium">Ação proposta:</span> {s.action}
            </p>
          </div>

          {show(4) ? (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="text-xs text-on-surface-variant">Budget diário</span>
              <span className="ledger-figure text-sm font-medium text-foreground">
                R$ {(phase === 4 && !reduce ? budget : s.budgetTo).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}/dia
              </span>
              <Badge variant="secondary" className="gap-1">
                <RotateCcw className="size-3" />
                Executado · reversível
              </Badge>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                className={
                  "flex-1 transition-transform " + (phase === 3 ? "scale-[0.97] brightness-95" : "")
                }
              >
                Aprovar
              </Button>
              <Button size="sm" variant="outline" className="flex-1">
                Rejeitar
              </Button>
            </div>
          )}

          {!reduce && phase === 3 && (
            <MousePointer2
              className="absolute right-[26%] -bottom-1 size-5 text-foreground drop-shadow"
              style={{ animation: "lp-ghost-click 1s ease forwards" }}
            />
          )}
        </div>
      </div>

      <p className="mt-3 px-1 text-xs text-on-surface-variant">
        Exemplo real do formato do feed — diagnóstico, evidência e ação, todos os dias.
      </p>
    </div>
  );
}

function PayoffNumber({
  value,
  decimals,
  active,
}: {
  value: number;
  decimals: number;
  active: boolean;
}) {
  const [display, setDisplay] = useState("0");
  useEffect(() => {
    if (!active) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay((value * eased).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, value, decimals]);
  return (
    <span className="ledger-figure text-4xl font-semibold text-primary [text-shadow:0_0_22px_color-mix(in_oklch,var(--md3-primary)_50%,transparent)]">
      {display}
    </span>
  );
}

function Sparkline({ series, active }: { series: number[]; active: boolean }) {
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  const points = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * 100;
      const y = 24 - ((v - min) / range) * 22 - 1;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="mt-2 h-8 w-full">
      <polyline
        points={points}
        fill="none"
        stroke="var(--md3-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: active ? 0 : 1,
          transition: "stroke-dashoffset 0.9s ease",
        }}
      />
    </svg>
  );
}
