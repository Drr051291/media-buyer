import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePlatformAdmin, UnauthorizedError } from "@/lib/auth/require-org";

const NAV_ITEMS = [
  { href: "/admin/tenants", label: "Tenants" },
  { href: "/admin/tokens-health", label: "Saúde de tokens" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/llm-usage", label: "Custo de LLM" },
  { href: "/admin/flags", label: "Feature flags" },
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
      <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30 p-4">
        <div className="mb-6 px-2">
          <p className="text-sm font-semibold">Painel da plataforma</p>
          <p className="text-xs text-muted-foreground">acesso restrito</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/app/dashboard" className="rounded-md px-2 py-1.5 text-sm hover:bg-muted">
          ← Voltar ao painel do cliente
        </Link>
      </aside>
      <main className="flex flex-1 flex-col overflow-auto p-8">{children}</main>
    </div>
  );
}
