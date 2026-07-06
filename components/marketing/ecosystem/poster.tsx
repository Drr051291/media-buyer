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
 * Versão estática do ecossistema (SSR e prefers-reduced-motion). Mesmo layout
 * da composição Remotion, sem movimento — o spoke do radar fica parado e cada
 * conector mostra um pulso a meio caminho.
 */
export function EcosystemPoster() {
  const rr = ORBIT_R + 8;
  const lead = { x: CENTER.x + rr, y: CENTER.y };
  const tailA = (-42 * Math.PI) / 180;
  const tail = { x: CENTER.x + rr * Math.cos(tailA), y: CENTER.y + rr * Math.sin(tailA) };
  const wedge = `M ${CENTER.x} ${CENTER.y} L ${tail.x} ${tail.y} A ${rr} ${rr} 0 0 1 ${lead.x} ${lead.y} Z`;

  return (
    <svg
      viewBox={`0 0 ${VIDEO.width} ${VIDEO.height}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="O agente no centro analisando o ecossistema do negócio: Lead, SQL, Ticket médio, Estoque, ERP e CRM."
    >
      {RADAR_RINGS.map((r) => (
        <circle key={r} cx={CENTER.x} cy={CENTER.y} r={r} fill="none" stroke={PALETTE.outlineVariant} strokeWidth={1} opacity={0.5} />
      ))}

      <g transform={`rotate(-32 ${CENTER.x} ${CENTER.y})`}>
        <path d={wedge} fill={PALETTE.primary} opacity={0.1} />
        <line x1={CENTER.x} y1={CENTER.y} x2={lead.x} y2={lead.y} stroke={PALETTE.primary} strokeWidth={2} opacity={0.5} />
      </g>

      {NODES.map((node) => {
        const pos = nodePosition(node.angleDeg);
        const mx = (pos.x + CENTER.x) / 2;
        const my = (pos.y + CENTER.y) / 2;
        return (
          <g key={node.label}>
            <line x1={pos.x} y1={pos.y} x2={CENTER.x} y2={CENTER.y} stroke={PALETTE.outlineVariant} strokeWidth={1} opacity={0.7} />
            <circle cx={mx} cy={my} r={2.6} fill={PALETTE.primary} opacity={0.85} />
          </g>
        );
      })}

      {NODES.map((node) => {
        const pos = nodePosition(node.angleDeg);
        const w = chipWidth(node.label);
        const x = pos.x - w / 2;
        const y = pos.y - CHIP_H / 2;
        return (
          <g key={node.label}>
            <rect x={x} y={y} width={w} height={CHIP_H} rx={CHIP_H / 2} fill={PALETTE.card} stroke={PALETTE.outlineVariant} strokeWidth={1} />
            <circle cx={x + 15} cy={y + CHIP_H / 2} r={3} fill={PALETTE.primary} />
            <text x={x + 26} y={y + CHIP_H / 2 + 4.5} fill={PALETTE.text} style={{ font: `500 13px ${SANS}` }}>
              {node.label}
            </text>
          </g>
        );
      })}

      <circle cx={CENTER.x} cy={CENTER.y} r={CENTER_R + 14} fill={PALETTE.primary} opacity={0.12} />
      <circle cx={CENTER.x} cy={CENTER.y} r={CENTER_R} fill={PALETTE.primary} />
      <circle cx={CENTER.x} cy={CENTER.y} r={CENTER_R - 8} fill="none" stroke={PALETTE.onPrimary} strokeWidth={1} opacity={0.35} />
      <path
        d={sparkle(CENTER.x, CENTER.y - 4)}
        fill={PALETTE.onPrimary}
      />
      <text x={CENTER.x} y={CENTER.y + 22} textAnchor="middle" fill={PALETTE.onPrimary} style={{ font: `600 12px ${SANS}` }}>
        Agente
      </text>
    </svg>
  );
}

function sparkle(cx: number, cy: number) {
  const r = 12;
  const w = 3.4;
  return `M ${cx} ${cy - r} C ${cx + w} ${cy - w} ${cx + w} ${cy - w} ${cx + r} ${cy} C ${cx + w} ${cy + w} ${cx + w} ${cy + w} ${cx} ${cy + r} C ${cx - w} ${cy + w} ${cx - w} ${cy + w} ${cx - r} ${cy} C ${cx - w} ${cy - w} ${cx - w} ${cy - w} ${cx} ${cy - r} Z`;
}
