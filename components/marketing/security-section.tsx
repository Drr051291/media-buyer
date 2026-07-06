"use client";

import { useState } from "react";
import { ShieldCheck, Clock3, Lock, Power, Eye } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

function Toggle({ label, defaultOn = true }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => setOn((v) => !v)}
      className="flex w-full items-center justify-between gap-3"
    >
      <span className="text-sm text-foreground">{label}</span>
      <span
        className={
          "relative h-5 w-9 shrink-0 rounded-full transition-colors " +
          (on ? "bg-primary" : "bg-outline-variant")
        }
      >
        <span
          className={
            "absolute top-0.5 size-4 rounded-full bg-surface-container-lowest transition-all " +
            (on ? "left-4" : "left-0.5")
          }
        />
      </span>
    </button>
  );
}

function Slider({ label, min, max, value: initial, format }: { label: string; min: number; max: number; value: number; format: (v: number) => string }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <span className="ledger-figure text-sm font-medium text-primary">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-label={label}
        className="lp-range h-1.5 w-full cursor-pointer appearance-none rounded-full bg-outline-variant"
      />
    </div>
  );
}

export function SecuritySection() {
  const [killed, setKilled] = useState(false);

  return (
    <section className="border-y border-outline-variant/60 bg-surface-container-low px-margin-mobile py-24 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <Reveal className="max-w-2xl">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Segurança e controle
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            A sala de controles é sua
          </h2>
          <p className="mt-4 text-lg text-on-surface-variant">
            Mexa nos controles abaixo — é assim que funciona no produto. Nada aqui é salvo.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Reveal>
            <div className="flex h-full flex-col gap-4 rounded-2xl border border-outline-variant/50 bg-card p-6">
              <div className="flex items-center gap-2 text-primary">
                <ShieldCheck className="size-4" />
                <span className="text-xs font-medium tracking-wide uppercase">Guardrails de budget</span>
              </div>
              <Slider label="Variação máxima por ação" min={5} max={40} value={20} format={(v) => `±${v}%`} />
              <Slider label="Teto de spend diário" min={500} max={5000} value={2000} format={(v) => `R$ ${v.toLocaleString("pt-BR")}`} />
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="flex h-full flex-col gap-4 rounded-2xl border border-outline-variant/50 bg-card p-6">
              <div className="flex items-center gap-2 text-primary">
                <Clock3 className="size-4" />
                <span className="text-xs font-medium tracking-wide uppercase">Ritmo e proteção</span>
              </div>
              <Toggle label="Cooldown de 48h entre mudanças" />
              <Toggle label="Respeitar janela de execução" />
              <Toggle label="Entidades protegidas (blacklist)" />
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="flex h-full flex-col gap-4 rounded-2xl border border-outline-variant/50 bg-card p-6">
              <div className="flex items-center gap-2 text-primary">
                <Eye className="size-4" />
                <span className="text-xs font-medium tracking-wide uppercase">Autonomia e cofre</span>
              </div>
              <Toggle label="Começar em modo somente-leitura" />
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <Lock className="size-4 text-primary" />
                Tokens criptografados no cofre — nunca expostos.
              </div>
              <button
                type="button"
                onClick={() => setKilled((v) => !v)}
                aria-pressed={killed}
                className={
                  "mt-auto flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors " +
                  (killed
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-outline-variant text-foreground hover:border-destructive/50 hover:text-destructive")
                }
              >
                <Power className="size-4" />
                {killed ? "Automação pausada" : "Kill switch"}
              </button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
