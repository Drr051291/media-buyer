/**
 * Geometria e paleta do "ecossistema" — o agente no centro fazendo a varredura
 * do negócio inteiro (Lead, SQL, Estoque, Ticket médio, ERP, CRM), não só da
 * mídia. Cores extraídas da identidade do projeto (globals.css :root, tema
 * claro — a animação vive sobre o fundo claro do hero). Compartilhado entre a
 * composição Remotion (animada) e o poster estático (SSR/reduced-motion).
 */

export const PALETTE = {
  bg: "#fdf8f6", // --md3-surface
  card: "#ffffff", // --md3-surface-container-lowest
  primary: "#6f331d", // --md3-primary (accent)
  primaryContainer: "#8c4a32",
  onPrimary: "#ffffff",
  secondary: "#865132",
  text: "#1c1b1a", // --md3-on-surface
  muted: "#53433e", // --md3-on-surface-variant
  outline: "#86736d",
  outlineVariant: "#d9c2ba",
} as const;

export const VIDEO = {
  width: 600,
  height: 560,
  fps: 30,
  durationInFrames: 180, // 6s — loop perfeito (motions periódicos)
} as const;

export const CENTER = { x: 300, y: 280 };
export const ORBIT_R = 200;
export const RADAR_RINGS = [80, 140, 200];

export type EcoNode = {
  label: string;
  angleDeg: number;
  /** categoria só para leitura; a legenda carrega o significado */
  group: "aquisição" | "receita" | "operação";
};

export const NODES: EcoNode[] = [
  { label: "Lead", angleDeg: -90, group: "aquisição" },
  { label: "SQL", angleDeg: -30, group: "aquisição" },
  { label: "Ticket médio", angleDeg: 30, group: "receita" },
  { label: "Estoque", angleDeg: 90, group: "operação" },
  { label: "ERP", angleDeg: 150, group: "operação" },
  { label: "CRM", angleDeg: 210, group: "receita" },
];

export function nodePosition(angleDeg: number, radius = ORBIT_R) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CENTER.x + radius * Math.cos(a), y: CENTER.y + radius * Math.sin(a) };
}

export function chipWidth(label: string) {
  return label.length * 8.4 + 28;
}

export const CHIP_H = 30;
export const CENTER_R = 46;
