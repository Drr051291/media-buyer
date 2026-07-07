import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { PainBar } from "@/components/marketing/pain-bar";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { TransparencySection } from "@/components/marketing/transparency-section";
import { SignatureDivider } from "@/components/marketing/signature-divider";
import { BusinessResultSection } from "@/components/marketing/business-result-section";
import { MultichannelSection } from "@/components/marketing/multichannel-section";
import { SecuritySection } from "@/components/marketing/security-section";
import { SocialProofSection } from "@/components/marketing/social-proof-section";
import { PricingSummary } from "@/components/marketing/pricing-summary";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";

export const metadata: Metadata = {
  title: "Traffic Copilot — Gestão de Mídia com IA orientada a resultado",
  description:
    "A IA que gerencia suas mídias olhando o que virou venda, não só o que a plataforma reporta. Meta Ads disponível agora; Google Ads e TikTok em breve.",
  openGraph: {
    title: "Traffic Copilot — Gestão de Mídia com IA orientada a resultado",
    description:
      "A IA que gerencia suas mídias olhando o que virou venda, não só o que a plataforma reporta.",
    locale: "pt_BR",
    type: "website",
  },
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Traffic Copilot",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Gestão de mídia paga com IA orientada a resultado de negócio: análise diária de campanhas, contexto de negócio por conta e ações com diagnóstico e aprovação humana.",
};

export default function MarketingHome() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <Hero />
      <PainBar />
      <HowItWorks />
      <TransparencySection />
      <SignatureDivider />
      <BusinessResultSection />
      <MultichannelSection />
      <SecuritySection />
      <SocialProofSection />
      <PricingSummary />
      <FaqSection />
      <FinalCta />
    </>
  );
}
