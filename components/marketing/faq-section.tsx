const FAQS = [
  {
    question: "Quais canais de mídia são suportados hoje?",
    answer:
      "Meta Ads está disponível agora. Google Ads e TikTok chegam em breve, na mesma plataforma.",
  },
  {
    question: "Preciso dar acesso total à minha conta?",
    answer:
      "Não. Você pode conectar em modo somente-leitura e liberar permissão de escrita apenas quando confiar no diagnóstico da IA.",
  },
  {
    question: "A IA pode gastar meu budget sem eu saber?",
    answer:
      "Não no modo Copiloto (padrão): toda ação de budget fica pendente até você aprovar. No Autopilot, só ações de baixo risco são automáticas, sempre dentro dos guardrails que você define, com notificação de tudo que foi executado.",
  },
  {
    question: "Funciona para leadgen e e-commerce?",
    answer:
      "Sim. O contexto de negócio de cada conta (ticket médio, margem, ciclo de venda, CPA/ROAS alvo) muda como a IA analisa e decide — não existe um benchmark genérico único.",
  },
  {
    question: "Como conecto minha conta?",
    answer:
      "Você gera um token de System User no seu próprio Business Manager e cola na plataforma (BYOT — Bring Your Own Token). Não exigimos login OAuth nem aprovação de app da Meta. Um wizard guia cada passo.",
  },
  {
    question: "Preciso conectar CRM/GA4 para usar?",
    answer:
      "Não é obrigatório, mas é o que destrava a otimização por resultado real de negócio — cruzando cada campanha com leads, vendas e margem, em vez de só a métrica que a Meta reporta.",
  },
  {
    question: "Substituo meu gestor de tráfego?",
    answer:
      "Não. O Traffic Copilot multiplica a capacidade do gestor — mesma pessoa operando mais contas e mais canais, com decisões explicadas, não uma caixa-preta que decide sozinha.",
  },
  {
    question: "Quais integrações de CRM/e-commerce existem?",
    answer:
      "Pipedrive e RD Station CRM, Shopify e Nuvemshop no e-commerce, Bling no ERP, GA4 para analytics, e um conector Make/webhook genérico para qualquer outro sistema.",
  },
];

import { Reveal } from "@/components/marketing/reveal";

export function FaqSection() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <section className="px-margin-mobile py-24 md:px-margin-desktop">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <p className="font-heading text-sm font-semibold tracking-wider text-secondary uppercase">
            Perguntas frequentes
          </p>
          <h2 className="mt-2 font-heading text-3xl font-bold text-primary md:text-4xl">
            Dúvidas comuns
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-8 divide-y divide-outline-variant/50 rounded-2xl border border-outline-variant/50 bg-card">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group p-5 open:pb-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground marker:content-none">
                  {faq.question}
                  <span className="shrink-0 text-lg text-on-surface-variant transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-on-surface-variant">{faq.answer}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
