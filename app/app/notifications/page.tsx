import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

interface EntityRefLike {
  name?: string;
}

interface NotificationPayload {
  action_id?: string;
  type?: string;
  entity_ref?: EntityRefLike;
  reason?: string;
}

function describe(type: string, payload: NotificationPayload): string {
  const entity = payload.entity_ref?.name ?? "entidade";
  if (type === "autopilot_executed") {
    return `Autopilot executou ${payload.type ?? "uma ação"} em "${entity}".`;
  }
  if (type === "autopilot_blocked") {
    return `Autopilot tentou ${payload.type ?? "uma ação"} em "${entity}" mas foi bloqueado: ${payload.reason ?? "guardrail"}.`;
  }
  return `${type}: ${JSON.stringify(payload)}`;
}

export default async function NotificationsPage() {
  const supabase = await createClient();

  const { data: notificationsRaw } = await supabase
    .from("notifications")
    .select("id, ad_account_id, type, payload, read_at, created_at, ad_accounts(name)")
    .order("created_at", { ascending: false })
    .limit(50);

  const notifications = notificationsRaw ?? [];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notificações</h1>
        {unreadCount > 0 && (
          <form action={markAllNotificationsRead}>
            <Button type="submit" size="sm" variant="outline">
              Marcar todas como lidas
            </Button>
          </form>
        )}
      </div>

      {notifications.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma notificação ainda.</p>
      )}

      <div className="flex flex-col gap-3">
        {notifications.map((n) => {
          const accountRef = Array.isArray(n.ad_accounts) ? n.ad_accounts[0] : n.ad_accounts;
          return (
            <Card key={n.id} className={n.read_at ? "opacity-60" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span>{accountRef?.name ?? "Conta"}</span>
                  {!n.read_at && <Badge variant="secondary">nova</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm">{describe(n.type, n.payload as NotificationPayload)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("pt-BR")}
                </p>
                {!n.read_at && (
                  <form action={markNotificationRead.bind(null, n.id)}>
                    <Button type="submit" size="sm" variant="ghost">
                      Marcar como lida
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
