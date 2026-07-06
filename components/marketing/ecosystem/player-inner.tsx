"use client";

import { Player } from "@remotion/player";
import { EcosystemComposition } from "./composition";
import { VIDEO } from "./shared";

/**
 * Isolado num módulo próprio para que `remotion` + `@remotion/player` + a
 * composição fiquem todos num único chunk carregado sob demanda (ver
 * ecosystem-animation.tsx), fora do caminho crítico do LCP.
 */
export default function PlayerInner() {
  return (
    <Player
      component={EcosystemComposition}
      durationInFrames={VIDEO.durationInFrames}
      fps={VIDEO.fps}
      compositionWidth={VIDEO.width}
      compositionHeight={VIDEO.height}
      loop
      autoPlay
      controls={false}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
