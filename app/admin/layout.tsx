import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, KeyRound, ListChecks, DollarSign, Flag, ArrowLeft } from "lucide-react";
import { requirePlatformAdmin, UnauthorizedError } from "@/lib/auth/require-org";

const NAV_ITEMS = [
  { href: "/admin/tenants", label: "Tenants", icon: Building2 },
  { href: "/admin/tokens-health", label: "Saúde de tokens", icon: KeyRound },
  { href: "/admin/jobs", label: "Jobs", icon: ListChecks },
  { href: "/admin/llm-usage", label: "Custo de LLM", icon: DollarSign },
  { href: "/admin/flags", label: "Feature flags", icon: Flag },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError && error.status === 401) redirect("/login");
    redirect("/app/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-outline-variant bg-inverse-surface px-3 py-6 text-inverse-on-surface">
        <div className="mb-8 px-3">
          <p className="font-heading text-lg font-semibold text-inverse-primary">Painel da plataforma</p>
          <p className="text-xs opacity-70">acesso restrito</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors hover:bg-white/10"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/app/dashboard"
          className="flex items-center gap-3 rounded-lg border-t border-white/10 px-4 py-3 pt-4 text-sm opacity-80 transition-colors hover:bg-white/10 hover:opacity-100"
        >
          <ArrowLeft className="size-4" />
          Voltar ao painel do cliente
        </Link>
      </aside>
      <main className="flex flex-1 flex-col overflow-auto bg-surface p-8">{children}</main>
    </div>
  );
}
