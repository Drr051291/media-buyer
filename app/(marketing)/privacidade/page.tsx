import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidade e LGPD — Traffic Copilot",
};

export default function PrivacidadePage() {
  return (
    <div className="mx-auto max-w-3xl px-margin-mobile py-20 md:px-margin-desktop">
      <h1 className="font-heading text-3xl font-bold text-primary">
        Privacidade e LGPD
      </h1>
      <p className="mt-6 text-on-surface-variant">
        Estamos em beta fechado e ainda finalizando a Política de Privacidade
        completa, incluindo o tratamento de dados sob a LGPD. Tokens de acesso à
        Meta ficam sempre criptografados no Supabase Vault e nunca são expostos
        ao frontend ou a terceiros. A versão completa desta política será
        publicada aqui antes do lançamento público.
      </p>
    </div>
  );
}
