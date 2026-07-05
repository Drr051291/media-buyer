"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { updateAutonomyMode, updateGuardrails, type SettingsActionState } from "./actions";

const initialState: SettingsActionState = { error: null };

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm";

const AUTONOMY_LABELS: Record<string, string> = {
  observador: "Observador — só análise e alertas, nenhuma escrita",
  copiloto: "Copiloto — ações entram no feed pendentes de aprovação",
  autopilot: "Autopilot — executa automaticamente ações de risco baixo",
};

export interface GuardrailsFormValues {
  max_budget_change_pct: number;
  daily_spend_cap: number | null;
  cooldown_hours: number;
  max_actions_per_day: number;
  protected_entity_ids: string[];
  execution_window: { startHour?: number; endHour?: number } | null;
}

export function AutonomyForm({
  adAccountId,
  currentMode,
  canEdit,
  autopilotEnabled,
}: {
  adAccountId: string;
  currentMode: string;
  canEdit: boolean;
  autopilotEnabled: boolean;
}) {
  const updateWithId = updateAutonomyMode.bind(null, adAccountId);
  const [state, formAction, pending] = useActionState(updateWithId, initialState);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <h2 className="text-sm font-semibold">Modo de autonomia</h2>
        <p className="text-xs text-muted-foreground">
          Só owner/admin da organização pode alterar. Autopilot precisa ser liberado pelo admin da plataforma
          (feature flag por tenant).
        </p>
        <form action={formAction} className="flex flex-col gap-3">
          <select
            name="autonomy_mode"
            defaultValue={currentMode}
            disabled={!canEdit}
            className={selectClass}
          >
            {(["observador", "copiloto", "autopilot"] as const).map((mode) => (
              <option key={mode} value={mode} disabled={mode === "autopilot" && !autopilotEnabled}>
                {AUTONOMY_LABELS[mode]}
                {mode === "autopilot" && !autopilotEnabled ? " (não liberado)" : ""}
              </option>
            ))}
          </select>
          {canEdit && (
            <Button type="submit" disabled={pending} size="sm" className="w-fit">
              Salvar modo
            </Button>
          )}
          {state.error && <p className="text-xs text-destructive">{state.error}</p>}
          {state.ok && <p className="text-xs text-muted-foreground">Salvo.</p>}
        </form>
      </CardContent>
    </Card>
  );
}

export function GuardrailsForm({
  adAccountId,
  values,
}: {
  adAccountId: string;
  values: GuardrailsFormValues;
}) {
  const updateWithId = updateGuardrails.bind(null, adAccountId);
  const [state, formAction, pending] = useActionState(updateWithId, initialState);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <h2 className="text-sm font-semibold">Guardrails</h2>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="max_budget_change_pct">Variação máxima de budget (%)</Label>
              <Input
                id="max_budget_change_pct"
                name="max_budget_change_pct"
                type="number"
                defaultValue={values.max_budget_change_pct}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="daily_spend_cap">Teto de spend diário (opcional)</Label>
              <Input
                id="daily_spend_cap"
                name="daily_spend_cap"
                type="number"
                defaultValue={values.daily_spend_cap ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cooldown_hours">Cooldown entre mudanças (horas)</Label>
              <Input id="cooldown_hours" name="cooldown_hours" type="number" defaultValue={values.cooldown_hours} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="max_actions_per_day">Máximo de ações executadas por dia</Label>
              <Input
                id="max_actions_per_day"
                name="max_actions_per_day"
                type="number"
                defaultValue={values.max_actions_per_day}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="execution_window_start">Janela de execução — início (0-23h)</Label>
              <Input
                id="execution_window_start"
                name="execution_window_start"
                type="number"
                min={0}
                max={23}
                defaultValue={values.execution_window?.startHour ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="execution_window_end">Janela de execução — fim (0-23h)</Label>
              <Input
                id="execution_window_end"
                name="execution_window_end"
                type="number"
                min={0}
                max={23}
                defaultValue={values.execution_window?.endHour ?? ""}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="protected_entity_ids">Entidades protegidas — meta_id, 1 por linha</Label>
            <Textarea
              id="protected_entity_ids"
              name="protected_entity_ids"
              defaultValue={values.protected_entity_ids.join("\n")}
              rows={3}
              placeholder="Ex: 120211112233445"
            />
          </div>
          <Button type="submit" disabled={pending} size="sm" className="w-fit">
            Salvar guardrails
          </Button>
          {state.error && <p className="text-xs text-destructive">{state.error}</p>}
          {state.ok && <p className="text-xs text-muted-foreground">Salvo.</p>}
        </form>
      </CardContent>
    </Card>
  );
}
