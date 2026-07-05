import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-outline-variant/60 bg-surface-container-low">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-margin-mobile py-12 md:px-margin-desktop">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="font-heading text-lg font-semibold text-primary">Traffic Copilot</p>
            <p className="mt-1 text-sm text-on-surface-variant">Feito no Brasil 🇧🇷</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-on-surface-variant">
            <Link href="/termos" className="hover:text-foreground">
              Termos
            </Link>
            <Link href="/privacidade" className="hover:text-foreground">
              Privacidade / LGPD
            </Link>
          </nav>
        </div>
        <p className="text-xs text-on-surface-variant/80">
          © {new Date().getFullYear()} Traffic Copilot. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
