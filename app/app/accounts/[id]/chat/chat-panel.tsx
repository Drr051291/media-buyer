"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string | null;
  created_at: string;
}

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
}

export function ChatPanel({
  adAccountId,
  initialMessages,
}: {
  adAccountId: string;
  initialMessages: ChatHistoryMessage[];
}) {
  const [messages, setMessages] = useState<DisplayMessage[]>(
    initialMessages.map((m) => ({ role: m.role, content: m.content ?? "" })),
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = () => {
    const text = draft.trim();
    if (!text || pending) return;

    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setDraft("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adAccountId, message: text }),
        });
        const body = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
        if (!res.ok) throw new Error(body.error || "Falha ao falar com o agente");

        setMessages((prev) => [...prev, { role: "assistant", content: body.reply ?? "" }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro inesperado");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto py-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Pergunte algo como &quot;por que o CPA subiu essa semana?&quot; ou &quot;audita a campanha X&quot;.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted"
              }`}
            >
              {m.content}
            </div>
          ))}
          {pending && <p className="text-xs text-muted-foreground">Analisando…</p>}
        </CardContent>
      </Card>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Pergunte sobre a conta…"
          className="min-h-16"
        />
        <Button disabled={pending || !draft.trim()} onClick={send}>
          Enviar
        </Button>
      </div>
    </div>
  );
}
