import {
  PALETTE,
  VIDEO,
  CENTER,
  ORBIT_R,
  RADAR_RINGS,
  NODES,
  nodePosition,
  chipWidth,
  CHIP_H,
  CENTER_R,
} from "./shared";

const SANS = "var(--font-be-vietnam-pro), ui-sans-serif, system-ui, sans-serif";

/**
 * A animação do hero: o agente no centro faz a varredura (radar) do negócio
 * inteiro — Lead, SQL, Ticket médio, Estoque, ERP, CRM — e cada sinal pulsa
 * para dentro. SVG + CSS puro: zero JS, renderiza no servidor, funciona em
 * todo browser e respeita prefers-reduced-motion. A mesma cena existe como
 * composição Remotion (remotion/) para exportar em vídeo.
 */
export function EcosystemAnimation() {
  const rr = ORBIT_R + 8;
  const lead = { x: CENTER.x + rr, y: CENTER.y };
  const tailA = (-42 * Math.PI) / 180;
  const tail = { x: CENTER.x + rr * Math.cos(tailA), y: CENTER.y + rr * Math.sin(tailA) };
  const wedge = `M ${CENTER.x} ${CENTER.y} L ${tail.x} ${tail.y} A ${rr} ${rr} 0 0 1 ${lead.x} ${lead.y} Z`;

  return (
    <figure className="relative w-full max-w-md">
      <div className="relative aspect-[600/560] w-full overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-lowest">
        <svg
          viewBox={`0 0 ${VIDEO.width} ${VIDEO.height}`}
          width="100%"
          height="100%"
          role="img"
          aria-label="O agente no centro analisando o ecossistema do negócio: Lead, SQL, Ticket médio, Estoque, ERP e CRM."
        >
          {/* anéis de radar */}
          {RADAR_RINGS.map((r) => (
            <circle key={r} cx={CENTER.x} cy={CENTER.y} r={r} fill="none" stroke={PALETTE.outlineVariant} strokeWidth={1} opacity={0.5} />
          ))}

          {/* varredura do radar (gira) */}
          <g className="lp-eco__sweep">
            <path d={wedge} fill={PALETTE.primary} opacity={0.1} />
            <line x1={CENTER.x} y1={CENTER.y} x2={lead.x} y2={lead.y} stroke={PALETTE.primary} strokeWidth={2} opacity={0.5} />
          </g>

          {/* conectores + pulsos (sinal → centro) */}
          {NODES.map((node, i) => {
            const pos = nodePosition(node.angleDeg);
            const dx = pos.x - CENTER.x;
            const dy = pos.y - CENTER.y;
            return (
              <g key={node.label}>
                <line x1={pos.x} y1={pos.y} x2={CENTER.x} y2={CENTER.y} stroke={PALETTE.outlineVariant} strokeWidth={1} opacity={0.7} />
                {[0, 1].map((k) => (
                  <circle
                    key={k}
                    className="lp-eco__pulse"
                    cx={CENTER.x}
                    cy={CENTER.y}
                    r={2.6}
                    fill={PALETTE.primary}
                    style={
                      {
                        "--dx": `${dx}px`,
                        "--dy": `${dy}px`,
                        animationDelay: `${-(i * 0.5 + k * 1.7)}s`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </g>
            );
          })}

          {/* chips dos sinais de negócio */}
          {NODES.map((node, i) => {
            const pos = nodePosition(node.angleDeg);
            const w = chipWidth(node.label);
            const x = pos.x - w / 2;
            const y = pos.y - CHIP_H / 2;
            return (
              <g key={node.label} className="lp-eco__chip" style={{ animationDelay: `${-i * 0.6}s` }}>
                <rect x={x} y={y} width={w} height={CHIP_H} rx={CHIP_H / 2} fill={PALETTE.card} stroke={PALETTE.outlineVariant} strokeWidth={1} />
                <circle cx={x + 15} cy={y + CHIP_H / 2} r={3} fill={PALETTE.primary} />
                <text x={x + 26} y={y + CHIP_H / 2 + 4.5} fill={PALETTE.text} style={{ font: `500 13px ${SANS}` }}>
                  {node.label}
                </text>
              </g>
            );
          })}

          {/* halo pulsante + nó central (o agente) */}
          <circle className="lp-eco__halo" cx={CENTER.x} cy={CENTER.y} r={CENTER_R + 14} fill={PALETTE.primary} opacity={0.12} />
          <circle cx={CENTER.x} cy={CENTER.y} r={CENTER_R} fill={PALETTE.primary} />
          <circle cx={CENTER.x} cy={CENTER.y} r={CENTER_R - 8} fill="none" stroke={PALETTE.onPrimary} strokeWidth={1} opacity={0.35} />
          <path d={sparkle(CENTER.x, CENTER.y - 4)} fill={PALETTE.onPrimary} />
          <text x={CENTER.x} y={CENTER.y + 22} textAnchor="middle" fill={PALETTE.onPrimary} style={{ font: `600 12px ${SANS}` }}>
            Agente
          </text>
        </svg>
      </div>
      <figcaption className="mt-3 px-1 text-xs text-on-surface-variant">
        O agente olha o negócio inteiro — do lead ao estoque, do CRM ao ERP — não só a mídia.
      </figcaption>
    </figure>
  );
}

/** Faísca de 4 pontas (o "spark" do produto). */
function sparkle(cx: number, cy: number) {
  const r = 12;
  const w = 3.4;
  return `M ${cx} ${cy - r} C ${cx + w} ${cy - w} ${cx + w} ${cy - w} ${cx + r} ${cy} C ${cx + w} ${cy + w} ${cx + w} ${cy + w} ${cx} ${cy + r} C ${cx - w} ${cy + w} ${cx - w} ${cy + w} ${cx - r} ${cy} C ${cx - w} ${cy - w} ${cx - w} ${cy - w} ${cx} ${cy - r} Z`;
}
