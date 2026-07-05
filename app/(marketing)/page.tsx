import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingHome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-surface p-16 text-center">
      <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">Traffic Copilot</p>
      <h1 className="max-w-2xl font-heading text-5xl font-bold tracking-tight text-primary">
        Seu copiloto de tráfego com IA para Meta Ads
      </h1>
      <p className="max-w-xl text-lg text-on-surface-variant">
        Analise métricas com o contexto de negócio de cada conta e escale de 15 para
        50 contas sem contratar.
      </p>
      <div className="flex gap-3">
        <Button render={<Link href="/signup">Começar agora</Link>} />
        <Button variant="outline" render={<Link href="/login">Entrar</Link>} />
      </div>
    </div>
  );
}
