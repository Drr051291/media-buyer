import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatPanel, type ChatHistoryMessage } from "./chat-panel";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase.from("ad_accounts").select("id, name").eq("id", id).maybeSingle();
  if (!account) notFound();

  const { data: messagesRaw } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("ad_account_id", id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(50);

  const initialMessages = (messagesRaw ?? []) as ChatHistoryMessage[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-4xl font-bold text-primary">Chat — {account.name}</h1>
        <p className="text-sm text-on-surface-variant">
          Converse sobre a conta em linguagem natural. O agente só lê dados já processados e pode propor ações — nunca
          executa nada sem aprovação no feed.
        </p>
      </div>
      <ChatPanel adAccountId={id} initialMessages={initialMessages} />
    </div>
  );
}
