import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { logout } from "./actions";

const NAV_ITEMS = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/accounts", label: "Contas" },
  { href: "/app/reports", label: "Relatórios" },
  { href: "/app/settings/connections", label: "Conexões" },
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
      <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30 p-4">
        <div className="mb-6 px-2">
          <p className="text-sm font-semibold">{activeOrg?.name ?? "Sua organização"}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
          <Link href="/app/notifications" className="rounded-md px-2 py-1.5 text-sm hover:bg-muted">
            Notificações{unreadCount ? ` (${unreadCount})` : ""}
          </Link>
        </nav>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
            Sair
          </Button>
        </form>
      </aside>
      <main className="flex flex-1 flex-col overflow-auto p-8">{children}</main>
    </div>
  );
}
