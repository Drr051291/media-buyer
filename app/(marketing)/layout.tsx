import Script from "next/script";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-surface">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <Script src="/tracking/copiloto-tracking.js" strategy="afterInteractive" />
    </div>
  );
}
