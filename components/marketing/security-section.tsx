import { Eye, ShieldCheck, Clock3, History, Lock, Power } from "lucide-react";

const GUARDRAILS = [
  { icon: Eye, label: "Modo somente-leitura para começar" },
  { icon: ShieldCheck, label: "Guardrails de budget e entidades protegidas" },
  { icon: Clock3, label: "Cooldown que respeita a fase de aprendizagem" },
  { icon: History, label: "Auditoria e reversão de toda ação" },
  { icon: Lock, label: "Seus tokens criptografados, nunca expostos" },
  { icon: Power, label: "Kill switch a qualquer momento" },
];

export function SecuritySection() {
  return (
    <section className="px-margin-mobile py-20 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Segurança e controle
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Automação com cinto de segurança
          </h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GUARDRAILS.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-xl border border-outline-variant/50 bg-card p-4"
            >
              <item.icon className="size-5 shrink-0 text-primary" />
              <p className="text-sm text-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
