const PERSONAS = [
  {
    title: "Gestor de tráfego solo",
    description: "Opere como um time. Mais contas e mais canais, mesma agenda.",
  },
  {
    title: "Agências",
    description:
      "Padrão de análise sênior em toda a carteira, do júnior ao head. Relatórios de resultado prontos para o cliente.",
  },
  {
    title: "Times de mídia in-house",
    description: "Monitoramento contínuo e resposta rápida, sem crescer o headcount.",
  },
];

export function PersonasSection() {
  return (
    <section className="bg-surface-container-low px-margin-mobile py-20 md:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
          Para quem é
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {PERSONAS.map((persona) => (
            <div
              key={persona.title}
              className="artisanal-card rounded-2xl border border-outline-variant/50 bg-card p-6"
            >
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {persona.title}
              </h3>
              <p className="mt-2 text-sm text-on-surface-variant">{persona.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
