const PAINS = [
  "Horas por dia pulando entre Ads Manager, Google Ads e planilhas, conta por conta.",
  "Decisão no feeling porque não dá tempo de cruzar campanha com o que virou venda.",
  'Cliente perguntando "por que o CPA subiu?" antes de você saber que subiu.',
];

export function PainBar() {
  return (
    <section className="border-y border-outline-variant/60 bg-surface-container-low">
      <div className="mx-auto max-w-7xl px-margin-mobile py-12 md:px-margin-desktop">
        <p className="font-heading text-lg font-medium text-foreground">
          Você sabe o que acontece quando a carteira cresce:
        </p>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {PAINS.map((pain) => (
            <li
              key={pain}
              className="rounded-xl border border-outline-variant/50 bg-card p-5 text-sm text-on-surface-variant"
            >
              {pain}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
