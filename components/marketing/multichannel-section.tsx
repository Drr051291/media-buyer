import { Reveal } from "@/components/marketing/reveal";

const CHANNELS = [
  { name: "Meta Ads", live: true, cx: 90, cy: 70 },
  { name: "Google Ads", live: false, cx: 70, cy: 175 },
  { name: "TikTok", live: false, cx: 120, cy: 275 },
];

const CENTER = { x: 300, y: 175 };

export function MultichannelSection() {
  return (
    <section className="px-margin-mobile py-24 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <Reveal className="max-w-2xl">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Visão de plataforma
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Um cérebro de mídia para todos os seus canais
          </h2>
          <p className="mt-4 text-lg text-on-surface-variant">
            Hoje o Traffic Copilot opera Meta Ads. Google Ads e TikTok chegam em breve — e a
            análise não fica em silos: a IA realoca budget entre canais pelo resultado real de
            negócio, não por métrica isolada de cada plataforma.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-10 rounded-2xl border border-outline-variant/50 bg-card p-4 sm:p-8">
            <svg viewBox="0 0 620 350" className="h-auto w-full" role="img" aria-label="Diagrama: três canais convergindo para um único painel de resultado">
              {/* linhas canal → centro (fluxo animado) */}
              {CHANNELS.map((ch) => (
                <line
                  key={ch.name}
                  x1={ch.cx}
                  y1={ch.cy}
                  x2={CENTER.x}
                  y2={CENTER.y}
                  stroke={ch.live ? "var(--md3-primary)" : "var(--md3-outline-variant)"}
                  strokeWidth={ch.live ? 1.5 : 1}
                  strokeDasharray="4 6"
                  className={ch.live ? "lp-flow" : "lp-flow lp-flow--muted"}
                />
              ))}

              {/* nós de canal */}
              {CHANNELS.map((ch) => (
                <g key={ch.name}>
                  <circle
                    cx={ch.cx}
                    cy={ch.cy}
                    r="7"
                    fill={ch.live ? "var(--md3-primary)" : "var(--md3-surface)"}
                    stroke={ch.live ? "var(--md3-primary)" : "var(--md3-outline)"}
                    strokeWidth="1.5"
                  />
                  <text
                    x={ch.cx + 16}
                    y={ch.cy + 4}
                    fill="var(--md3-on-surface)"
                    className="font-sans text-[13px]"
                  >
                    {ch.name}
                  </text>
                  {!ch.live && (
                    <text
                      x={ch.cx + 16}
                      y={ch.cy + 20}
                      fill="var(--md3-on-surface-variant)"
                      className="font-sans text-[11px]"
                    >
                      em breve
                    </text>
                  )}
                </g>
              ))}

              {/* nó central */}
              <circle cx={CENTER.x} cy={CENTER.y} r="30" fill="var(--md3-primary)" opacity="0.08" />
              <circle cx={CENTER.x} cy={CENTER.y} r="18" fill="var(--md3-surface)" stroke="var(--md3-primary)" strokeWidth="1.5" />
              <text x={CENTER.x} y={CENTER.y + 4} textAnchor="middle" fill="var(--md3-primary)" className="font-sans text-[11px] font-medium">
                IA
              </text>
              <text x={CENTER.x} y={CENTER.y + 46} textAnchor="middle" fill="var(--md3-on-surface-variant)" className="font-sans text-[12px]">
                cérebro de mídia
              </text>

              {/* linha grossa centro → resultado */}
              <line x1={CENTER.x + 18} y1={CENTER.y} x2="470" y2={CENTER.y} stroke="var(--md3-primary)" strokeWidth="2.5" />
              <polygon points="470,169 470,181 480,175" fill="var(--md3-primary)" />

              {/* card resultado */}
              <rect x="482" y="145" width="120" height="60" rx="12" fill="var(--md3-primary)" />
              <text x="542" y="170" textAnchor="middle" fill="var(--md3-on-primary)" className="font-heading text-[13px] font-semibold">
                Resultado
              </text>
              <text x="542" y="188" textAnchor="middle" fill="var(--md3-on-primary)" className="font-sans text-[11px]" opacity="0.85">
                do negócio
              </text>
            </svg>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
