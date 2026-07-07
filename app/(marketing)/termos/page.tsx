import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Uso — Traffic Copilot",
};

export default function TermosPage() {
  return (
    <div className="mx-auto max-w-3xl px-margin-mobile py-20 md:px-margin-desktop">
      <h1 className="font-heading text-3xl font-bold text-primary">Termos de Uso</h1>
      <p className="mt-6 text-on-surface-variant">
        Estamos em beta fechado e ainda finalizando os Termos de Uso com apoio
        jurídico. A versão completa será publicada aqui antes do lançamento público.
        Dúvidas sobre o beta podem ser tratadas diretamente com o time durante o
        onboarding.
      </p>
    </div>
  );
}
