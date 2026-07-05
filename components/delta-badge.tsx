import { cn } from "@/lib/utils";
import { formatDeltaPct } from "@/lib/format";

/**
 * Selo de variação percentual entre período atual e anterior.
 * `higherIsBetter=false` inverte as cores (ex: CPA/CPM subir é ruim).
 */
export function DeltaBadge({
  value,
  higherIsBetter = true,
}: {
  value: number | null;
  higherIsBetter?: boolean;
}) {
  if (value == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const isGood = higherIsBetter ? value >= 0 : value <= 0;

  return (
    <span
      className={cn(
        "text-xs font-medium",
        isGood ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
    >
      {formatDeltaPct(value)}
    </span>
  );
}
