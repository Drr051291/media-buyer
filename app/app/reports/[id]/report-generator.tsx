"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { generateReportAction, type GenerateReportState } from "./actions";

const initialState: GenerateReportState = { report: null, error: null };

export function ReportGenerator({ adAccountId }: { adAccountId: string }) {
  const boundAction = generateReportAction.bind(null, adAccountId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction}>
        <Button type="submit" disabled={pending}>
          {pending ? "Gerando..." : "Gerar relatório semanal"}
        </Button>
      </form>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      {state.report && (
        <Card>
          <CardContent className="pt-6">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{state.report}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
