"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/components/marketing/use-prefers-reduced-motion";

function formatPtBr(value: number, decimals: number) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Conta de 0 até `target` quando o elemento entra no viewport (uma vez).
 * Usa tabular-nums no consumidor para evitar layout shift. Sob
 * `prefers-reduced-motion: reduce` salta direto para o valor final.
 */
export function useCountUp(target: number, { decimals = 0, duration = 1100 } = {}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = usePrefersReducedMotion();
  const [display, setDisplay] = useState(() => formatPtBr(0, decimals));

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      const raf = requestAnimationFrame(() => setDisplay(formatPtBr(target, decimals)));
      return () => cancelAnimationFrame(raf);
    }

    let raf = 0;
    let started = false;
    const animate = (start: number) => (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(formatPtBr(target * eased, decimals));
      if (t < 1) raf = requestAnimationFrame(animate(start));
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((e) => e.isIntersecting)) return;
        started = true;
        observer.disconnect();
        if (reduce) {
          setDisplay(formatPtBr(target, decimals));
          return;
        }
        raf = requestAnimationFrame((now) => animate(now)(now));
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target, decimals, duration, reduce]);

  return { ref, display };
}
