import { Eye, ShieldCheck, Clock3, History, Lock, Power, Check, Clock } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

const CHANNELS = [
  { name: "Meta Ads", live: true },
  { name: "Google Ads", live: false },
  { name: "TikTok", live: false },
];

const SMALL_TILES = [
  {
    icon: Clock3,
    title: "Cooldown de aprendizagem",
    description: "Nenhuma entidade sofre duas mudanças de budget em menos de 48h.",
  },
  {
    icon: History,
    title: "Auditoria e reversão",
    description: "Trilha completa de toda ação, com reversão em um clique.",
  },
  {
    icon: Lock,
    title: "Tokens criptografados",
    description: "Seus tokens vivem em cofre criptografado, nunca expostos.",
  },
  {
    icon: Power,
    title: "Kill switch",
    description: "Pause toda a automação da conta a qualquer momento.",
  },
];

export function PlatformBento() {
  return (
    <section className="px-margin-mobile py-24 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <Reveal className="max-w-2xl">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Segurança e controle
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Automação com cinto de segurança
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          <Reveal className="lg:col-span-2 lg:row-span-2">
            <div className="artisanal-card flex h-full flex-col justify-between gap-8 rounded-2xl border border-outline-variant/50 bg-card p-7">
              <div>
                <h3 className="font-heading text-2xl font-semibold text-foreground">
                  Um cérebro de mídia para todos os seus canais
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-on-surface-variant">
                  Hoje o Traffic Copilot opera Meta Ads. Google Ads e TikTok chegam em
                  breve — e quando chegarem, a análise não fica em silos: a IA compara
                  desempenho e realoca budget entre canais pelo resultado real de
                  negócio, não por métrica isolada de cada plataforma.
                </p>
              </div>
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-1 flex-col gap-2">
                  {CHANNELS.map((channel) => (
                    <div
                      key={channel.name}
                      className={
                        "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium " +
                        (channel.live
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-outline-variant/50 bg-muted/40 text-on-surface-variant")
                      }
                    >
                      {channel.live ? <Check className="size-4" /> : <Clock className="size-4" />}
                      {channel.name}
                      <span className="ml-auto text-xs opacity-80">
                        {channel.live ? "ativo" : "em breve"}
                      </span>
                    </div>
                  ))}
                </div>
                <span
                  aria-hidden
                  className="hidden h-px w-10 shrink-0 bg-gradient-to-r from-outline-variant to-outline sm:block"
                />
                <div className="flex shrink-0 items-center justify-center rounded-xl border border-secondary/40 bg-secondary-container/40 px-6 py-8 text-center text-sm font-medium text-on-secondary-container sm:max-w-44">
                  Um único painel de resultado de negócio
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="artisanal-card flex h-full flex-col gap-3 rounded-2xl border border-outline-variant/50 bg-card p-6">
              <Eye className="size-5 text-primary" />
              <h3 className="font-heading text-lg font-semibold text-foreground">
                Comece só observando
              </h3>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                Modo somente-leitura no início: a IA analisa e recomenda, sem poder de
                escrita. Dê permissão de executar quando confiar.
              </p>
            </div>
          </Reveal>

          <Reveal delay={180}>
            <div className="artisanal-card flex h-full flex-col gap-3 rounded-2xl border border-outline-variant/50 bg-card p-6">
              <ShieldCheck className="size-5 text-primary" />
              <h3 className="font-heading text-lg font-semibold text-foreground">
                Guardrails de budget
              </h3>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                Variação máxima por ação, teto de spend diário e entidades protegidas
                que a IA nunca toca — definidos por você, por conta.
              </p>
            </div>
          </Reveal>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SMALL_TILES.map((tile, index) => (
            <Reveal key={tile.title} delay={index * 80}>
              <div className="artisanal-card flex h-full flex-col gap-2.5 rounded-2xl border border-outline-variant/50 bg-card p-5">
                <tile.icon className="size-4.5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">{tile.title}</h3>
                <p className="text-xs leading-relaxed text-on-surface-variant">
                  {tile.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
