import { Composition } from "remotion";
import { EcosystemComposition } from "../components/marketing/ecosystem/composition";
import { VIDEO } from "../components/marketing/ecosystem/shared";

/**
 * Raiz do Remotion — registra a composição do ecossistema para o Studio e para
 * render em vídeo (ver remotion/README.md). A MESMA composição é tocada ao vivo
 * no hero via @remotion/player (components/marketing/ecosystem/), então o vídeo
 * exportado é pixel-a-pixel consistente com a página.
 */
export function RemotionRoot() {
  return (
    <Composition
      id="Ecosystem"
      component={EcosystemComposition}
      durationInFrames={VIDEO.durationInFrames}
      fps={VIDEO.fps}
      width={VIDEO.width}
      height={VIDEO.height}
    />
  );
}
