"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { EcosystemPoster } from "./poster";
import { usePrefersReducedMotion } from "@/components/marketing/use-prefers-reduced-motion";

// Todo o runtime do Remotion (player + composição) vive neste chunk, carregado
// só depois do idle — o H1 é o LCP do hero, não a animação.
const PlayerInner = dynamic(() => import("./player-inner"), { ssr: false });

export function EcosystemAnimation() {
  const reduce = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const start = () => setReady(true);
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    const id = ric ? ric(start) : window.setTimeout(start, 500);
    return () => {
      if (!ric) clearTimeout(id as number);
    };
  }, [reduce]);

  return (
    <figure className="relative w-full max-w-md">
      <div className="relative aspect-[600/560] w-full overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-lowest">
        {/* Poster estático: SSR, primeiro paint e fallback de reduced-motion */}
        <div
          className={
            "absolute inset-0 transition-opacity duration-700 " +
            (ready && !reduce ? "opacity-0" : "opacity-100")
          }
        >
          <EcosystemPoster />
        </div>

        {/* Animação Remotion, montada pós-idle */}
        {ready && !reduce && (
          <div className="absolute inset-0">
            <PlayerInner />
          </div>
        )}
      </div>
      <figcaption className="mt-3 px-1 text-xs text-on-surface-variant">
        O agente olha o negócio inteiro — do lead ao estoque, do CRM ao ERP — não só a mídia.
      </figcaption>
    </figure>
  );
}
