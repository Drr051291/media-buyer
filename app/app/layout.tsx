import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Wallet, FileText, Plug, Blocks, Bell, LogOut, Sparkles } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { logout } from "./actions";

const NAV_ITEMS = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/accounts", label: "Contas", icon: Wallet },
  { href: "/app/reports", label: "Relatórios", icon: FileText },
  { href: "/app/settings/connections", label: "Conexões", icon: Plug },
  { href: "/app/integrations", label: "Integrações", icon: Blocks },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, activeOrg } = await getSessionContext();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { count: unreadCount } = activeOrg
    ? await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("org_id", activeOrg.id)
        .is("read_at", null)
    : { count: 0 };

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-outline-variant bg-surface-container px-3 py-6">
        <div className="mb-8 px-3">
          <h1 className="font-heading text-xl font-semibold text-primary">Traffic Copilot</h1>
          <p className="text-xs text-on-surface-variant">{activeOrg?.name ?? "Sua organização"}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-variant/50"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
          <Link
            href="/app/notifications"
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-variant/50"
          >
            <Bell className="size-4" />
            Notificações{unreadCount ? ` (${unreadCount})` : ""}
          </Link>
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t border-outline-variant px-1 pt-4">
          <Button render={<Link href="/app/settings/connections" />} className="w-full gap-2">
            <Sparkles className="size-4" />
            Conectar conta
          </Button>
          <div className="flex items-center justify-between px-2">
            <p className="truncate text-xs text-on-surface-variant">{user.email}</p>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sair">
                <LogOut className="size-4" />
              </Button>
            </form>
          </div>
        </div>
      </aside>
      <main className="flex flex-1 flex-col overflow-auto bg-surface p-8">{children}</main>
    </div>
  );
}
