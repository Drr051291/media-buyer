import { AbsoluteFill, useCurrentFrame } from "remotion";
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
const TAU = Math.PI * 2;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * O ecossistema do negócio: o agente no centro varre (radar) os sinais ao
 * redor — Lead, SQL, Ticket médio, Estoque, ERP, CRM — puxando cada um para
 * dentro. Todo movimento é periódico no intervalo da composição → loop perfeito.
 */
export function EcosystemComposition() {
  const frame = useCurrentFrame();
  const p = (frame % VIDEO.durationInFrames) / VIDEO.durationInFrames; // 0..1

  const sweepDeg = 360 * p;
  const haloScale = 1 + 0.08 * Math.sin(TAU * p);
  const haloOpacity = 0.1 + 0.07 * (0.5 + 0.5 * Math.sin(TAU * p));

  // wedge do radar (atrás do "spoke" líder, de -42°..0°)
  const rr = ORBIT_R + 8;
  const lead = { x: CENTER.x + rr, y: CENTER.y };
  const tailA = (-42 * Math.PI) / 180;
  const tail = { x: CENTER.x + rr * Math.cos(tailA), y: CENTER.y + rr * Math.sin(tailA) };
  const wedge = `M ${CENTER.x} ${CENTER.y} L ${tail.x} ${tail.y} A ${rr} ${rr} 0 0 1 ${lead.x} ${lead.y} Z`;

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <svg viewBox={`0 0 ${VIDEO.width} ${VIDEO.height}`} width="100%" height="100%">
        {/* anéis de radar */}
        {RADAR_RINGS.map((r) => (
          <circle
            key={r}
            cx={CENTER.x}
            cy={CENTER.y}
            r={r}
            fill="none"
            stroke={PALETTE.outlineVariant}
            strokeWidth={1}
            opacity={0.5}
          />
        ))}

        {/* varredura do radar */}
        <g transform={`rotate(${sweepDeg} ${CENTER.x} ${CENTER.y})`}>
          <path d={wedge} fill={PALETTE.primary} opacity={0.1} />
          <line
            x1={CENTER.x}
            y1={CENTER.y}
            x2={lead.x}
            y2={lead.y}
            stroke={PALETTE.primary}
            strokeWidth={2}
            opacity={0.5}
          />
        </g>

        {/* conectores + pulsos (sinal → centro) */}
        {NODES.map((node, i) => {
          const pos = nodePosition(node.angleDeg);
          const pulses = [0, 0.5].map((off) => {
            const t = (p * 2 + i * 0.17 + off) % 1;
            const x = lerp(pos.x, CENTER.x, t);
            const y = lerp(pos.y, CENTER.y, t);
            const o = Math.sin(Math.PI * t);
            return { x, y, o, key: `${i}-${off}` };
          });
          return (
            <g key={node.label}>
              <line
                x1={pos.x}
                y1={pos.y}
                x2={CENTER.x}
                y2={CENTER.y}
                stroke={PALETTE.outlineVariant}
                strokeWidth={1}
                opacity={0.7}
              />
              {pulses.map((pulse) => (
                <circle
                  key={pulse.key}
                  cx={pulse.x}
                  cy={pulse.y}
                  r={2.6}
                  fill={PALETTE.primary}
                  opacity={pulse.o * 0.85}
                />
              ))}
            </g>
          );
        })}

        {/* chips dos sinais de negócio */}
        {NODES.map((node, i) => {
          const pos = nodePosition(node.angleDeg);
          const bob = 3 * Math.sin(TAU * p + i);
          const w = chipWidth(node.label);
          const x = pos.x - w / 2;
          const y = pos.y - CHIP_H / 2 + bob;
          return (
            <g key={node.label}>
              <rect
                x={x}
                y={y}
                width={w}
                height={CHIP_H}
                rx={CHIP_H / 2}
                fill={PALETTE.card}
                stroke={PALETTE.outlineVariant}
                strokeWidth={1}
              />
              <circle cx={x + 15} cy={y + CHIP_H / 2} r={3} fill={PALETTE.primary} />
              <text
                x={x + 26}
                y={y + CHIP_H / 2 + 4.5}
                fill={PALETTE.text}
                style={{ font: `500 13px ${SANS}` }}
              >
                {node.label}
              </text>
            </g>
          );
        })}

        {/* halo pulsante do centro */}
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={CENTER_R * haloScale + 14}
          fill={PALETTE.primary}
          opacity={haloOpacity}
        />
        {/* nó central — o agente */}
        <circle cx={CENTER.x} cy={CENTER.y} r={CENTER_R} fill={PALETTE.primary} />
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={CENTER_R - 8}
          fill="none"
          stroke={PALETTE.onPrimary}
          strokeWidth={1}
          opacity={0.35}
        />
        <Sparkle cx={CENTER.x} cy={CENTER.y - 4} />
        <text
          x={CENTER.x}
          y={CENTER.y + 22}
          textAnchor="middle"
          fill={PALETTE.onPrimary}
          style={{ font: `600 12px ${SANS}` }}
        >
          Agente
        </text>
      </svg>
    </AbsoluteFill>
  );
}

/** Faísca de 4 pontas (o "spark" do produto). */
function Sparkle({ cx, cy }: { cx: number; cy: number }) {
  const r = 12;
  const w = 3.4;
  const d = `M ${cx} ${cy - r} C ${cx + w} ${cy - w} ${cx + w} ${cy - w} ${cx + r} ${cy} C ${cx + w} ${cy + w} ${cx + w} ${cy + w} ${cx} ${cy + r} C ${cx - w} ${cy + w} ${cx - w} ${cy + w} ${cx - r} ${cy} C ${cx - w} ${cy - w} ${cx - w} ${cy - w} ${cx} ${cy - r} Z`;
  return <path d={d} fill={PALETTE.onPrimary} />;
}
