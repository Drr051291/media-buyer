"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

async function postAction(actionId: string, verb: "approve" | "reject" | "revert", body?: Record<string, unknown>) {
  const res = await fetch(`/api/actions/${actionId}/${verb}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const responseBody = (await res.json().catch(() => ({}))) as { error?: string; violations?: string[] };
  if (!res.ok) {
    throw new Error(responseBody.violations?.join("; ") || responseBody.error || "Falha ao processar a ação");
  }
}

function useActionCommand(actionId: string, verb: "approve" | "reject" | "revert") {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (body?: Record<string, unknown>) => {
    setError(null);
    startTransition(async () => {
      try {
        await postAction(actionId, verb, body);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro inesperado");
      }
    });
  };

  return { run, pending, error };
}

export function ProposedActionButtons({ actionId }: { actionId: string }) {
  const approve = useActionCommand(actionId, "approve");
  const reject = useActionCommand(actionId, "reject");
  const [reason, setReason] = useState("");
  const pending = approve.pending || reject.pending;

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        placeholder="Motivo da rejeição (opcional) — ajuda o agente a aprender sua preferência"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-h-14 text-xs"
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => approve.run()}>
          Aprovar
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => reject.run({ reason: reason || undefined })}>
          Rejeitar
        </Button>
      </div>
      {(approve.error || reject.error) && (
        <p className="text-xs text-destructive">{approve.error ?? reject.error}</p>
      )}
    </div>
  );
}

export function RevertActionButton({ actionId }: { actionId: string }) {
  const revert = useActionCommand(actionId, "revert");

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="outline" disabled={revert.pending} onClick={() => revert.run()}>
        Reverter
      </Button>
      {revert.error && <p className="text-xs text-destructive">{revert.error}</p>}
    </div>
  );
}
