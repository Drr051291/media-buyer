import { Check, Clock } from "lucide-react";

const CHANNELS = [
  { name: "Meta Ads", status: "active" as const },
  { name: "Google Ads", status: "soon" as const },
  { name: "TikTok", status: "soon" as const },
];

export function MultichannelSection() {
  return (
    <section className="px-margin-mobile py-20 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Visão de plataforma
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Um cérebro de mídia para todos os seus canais
          </h2>
          <p className="mt-4 text-lg text-on-surface-variant">
            Hoje o Traffic Copilot opera Meta Ads. Google Ads e TikTok chegam em breve
            — e quando chegarem, a análise não fica em silos: a IA compara desempenho e
            realoca budget entre canais pelo resultado real de negócio, não por métrica
            isolada de cada plataforma.
          </p>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4 md:flex-row md:justify-center md:gap-6">
          {CHANNELS.map((channel, index) => (
            <div key={channel.name} className="flex items-center gap-4 md:gap-6">
              <div
                className={
                  "flex items-center gap-2 rounded-xl border px-5 py-4 text-sm font-medium " +
                  (channel.status === "active"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-outline-variant/50 bg-muted/40 text-on-surface-variant")
                }
              >
                {channel.status === "active" ? (
                  <Check className="size-4" />
                ) : (
                  <Clock className="size-4" />
                )}
                {channel.name}
                <span className="text-xs opacity-80">
                  {channel.status === "active" ? "ativo" : "em breve"}
                </span>
              </div>
              {index < CHANNELS.length - 1 && (
                <span className="hidden text-on-surface-variant/50 md:inline">→</span>
              )}
            </div>
          ))}
          <span className="hidden text-on-surface-variant/50 md:inline">→</span>
          <div className="rounded-xl border border-secondary/40 bg-secondary-container/40 px-5 py-4 text-sm font-medium text-on-secondary-container">
            Um painel de resultado
          </div>
        </div>
      </div>
    </section>
  );
}
