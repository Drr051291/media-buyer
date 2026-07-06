"use client";

import { useEffect, useRef, useState } from "react";

/**
 * O divisor-assinatura: uma linha que se bifurca. A linha "plataforma" some
 * em fade; a linha "real" segue no accent e conduz o olho à próxima seção.
 * Barato (SVG + stroke-dashoffset), único do produto. `amplified` é a versão
 * do S11 (mais alta, a linha real atravessa até o CTA).
 */
export function SignatureDivider({ amplified = false }: { amplified?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setOn(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && (setOn(true), observer.disconnect()),
      { rootMargin: "0px 0px -20% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const height = amplified ? 120 : 64;

  return (
    <div className="pointer-events-none mx-auto w-full max-w-7xl px-margin-mobile md:px-margin-desktop" aria-hidden>
      <svg
        ref={ref}
        data-on={on}
        viewBox={`0 0 1000 ${height}`}
        preserveAspectRatio="none"
        className="lp-divider h-16 w-full md:h-[--h]"
        style={{ ["--h" as string]: `${height}px` }}
      >
        {/* tronco comum */}
        <path
          className="lp-divider__stem"
          pathLength={1}
          d={`M0 ${height / 2} L440 ${height / 2}`}
          fill="none"
          stroke="var(--md3-outline)"
          strokeWidth="1"
        />
        {/* ramo plataforma — sobe e some */}
        <path
          className="lp-divider__ghost"
          pathLength={1}
          d={`M440 ${height / 2} C520 ${height / 2}, 540 ${height * 0.18}, 640 ${height * 0.18} L820 ${height * 0.18}`}
          fill="none"
          stroke="var(--md3-outline)"
          strokeWidth="1"
        />
        {/* ramo real — desce levemente e segue no accent */}
        <path
          className="lp-divider__real"
          pathLength={1}
          d={`M440 ${height / 2} C520 ${height / 2}, 540 ${height * 0.82}, 640 ${height * 0.82} L1000 ${height * 0.82}`}
          fill="none"
          stroke="var(--md3-primary)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}
