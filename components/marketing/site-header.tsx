"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#integracoes", label: "Integrações" },
  { href: "#precos", label: "Preços" },
];

export function SiteHeader() {
  // O CTA compacto no header só aparece depois que o usuário passa do hero/S3,
  // preservando a disciplina de um único CTA em destaque acima da dobra.
  const [showCta, setShowCta] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowCta(window.scrollY > 1200);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-margin-mobile md:px-margin-desktop">
        <Link href="/" className="font-heading text-lg font-semibold text-primary">
          Traffic Copilot
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-on-surface-variant transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" render={<Link href="/login">Entrar</Link>} />
          <div
            className={
              "transition-all duration-300 " +
              (showCta ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0")
            }
          >
            <Button
              size="sm"
              render={<Link href="/signup" data-analytics-event="click_cta_header" />}
            >
              Começar grátis
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
