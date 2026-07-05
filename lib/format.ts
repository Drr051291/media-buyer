export function formatCurrency(value: number | null, currency: string): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

export function formatNumber(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

export function formatPct(value: number | null, digits = 2): string {
  if (value == null) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatDeltaPct(value: number | null): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
