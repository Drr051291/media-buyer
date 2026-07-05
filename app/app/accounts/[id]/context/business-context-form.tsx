"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  BUSINESS_MODELS,
  ESTRATEGIAS,
  deriveCpaAlvo,
  type BusinessContextProfile,
} from "@/lib/engine/business-context";
import { saveBusinessContext, type SaveContextState } from "./actions";

const initialState: SaveContextState = { error: null };

const selectClass =
  "flex h-9 w-full border-0 border-b border-input bg-transparent px-1 py-1 text-sm focus:border-b-2 focus:border-primary focus:outline-none";

const sectionLabelClass = "mb-4 block font-heading text-xl text-secondary italic";

export function BusinessContextForm({
  adAccountId,
  profile,
  currency,
}: {
  adAccountId: string;
  profile: BusinessContextProfile;
  currency: string;
}) {
  const saveWithId = saveBusinessContext.bind(null, adAccountId);
  const [state, formAction, pending] = useActionState(saveWithId, initialState);

  const [ticketMedio, setTicketMedio] = useState(profile.ticket_medio?.toString() ?? "");
  const [margemBruta, setMargemBruta] = useState(profile.margem_bruta_pct?.toString() ?? "");
  const [cpaAlvo, setCpaAlvo] = useState(profile.cpa_alvo?.toString() ?? "");

  const suggestion = useMemo(
    () => deriveCpaAlvo(ticketMedio ? Number(ticketMedio) : null, margemBruta ? Number(margemBruta) : null),
    [ticketMedio, margemBruta],
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card className="p-2">
        <CardContent className="flex flex-col gap-4 pt-6">
          <label className={sectionLabelClass}>I. Sobre o negócio</label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="business_model">Modelo de negócio</Label>
              <select
                id="business_model"
                name="business_model"
                defaultValue={profile.business_model}
                className={selectClass}
              >
                <option value="">Selecione...</option>
                {BUSINESS_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="vertical">Vertical / nicho</Label>
              <Input id="vertical" name="vertical" defaultValue={profile.vertical} placeholder="Ex: joias e acessórios" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="descricao_livre">Descrição livre</Label>
            <Textarea
              id="descricao_livre"
              name="descricao_livre"
              defaultValue={profile.descricao_livre}
              placeholder="Ex: E-commerce de semijoias, público feminino 25-45, forte em datas comemorativas"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="p-2">
        <CardContent className="flex flex-col gap-4 border-t border-outline-variant/30 pt-6">
          <label className={sectionLabelClass}>II. Metas &amp; Eficiência</label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="objetivo_principal">Evento de conversão principal</Label>
              <Input
                id="objetivo_principal"
                name="objetivo_principal"
                defaultValue={profile.objetivo_principal}
                placeholder="purchase, lead, complete_registration..."
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="eventos_secundarios">Eventos secundários (1 por linha)</Label>
              <Textarea
                id="eventos_secundarios"
                name="eventos_secundarios"
                defaultValue={profile.eventos_secundarios.join("\n")}
                placeholder={"add_to_cart\ninitiate_checkout"}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ticket_medio">Ticket médio ({currency})</Label>
              <Input
                id="ticket_medio"
                name="ticket_medio"
                type="number"
                step="0.01"
                value={ticketMedio}
                onChange={(e) => setTicketMedio(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="margem_bruta_pct">Margem bruta (%)</Label>
              <Input
                id="margem_bruta_pct"
                name="margem_bruta_pct"
                type="number"
                step="0.1"
                value={margemBruta}
                onChange={(e) => setMargemBruta(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cpa_alvo">CPA alvo ({currency})</Label>
              <Input
                id="cpa_alvo"
                name="cpa_alvo"
                type="number"
                step="0.01"
                value={cpaAlvo}
                onChange={(e) => setCpaAlvo(e.target.value)}
              />
              {suggestion && (
                <p className="text-xs text-muted-foreground">
                  Breakeven estimado: {suggestion.breakeven.toFixed(2)} · Sugestão (70% do
                  breakeven): {suggestion.suggested.toFixed(2)}{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => setCpaAlvo(suggestion.suggested.toFixed(2))}
                  >
                    usar sugestão
                  </button>
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="roas_alvo">ROAS alvo</Label>
              <Input id="roas_alvo" name="roas_alvo" type="number" step="0.1" defaultValue={profile.roas_alvo ?? ""} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cpa_maximo_aceitavel">CPA máximo aceitável ({currency})</Label>
              <Input
                id="cpa_maximo_aceitavel"
                name="cpa_maximo_aceitavel"
                type="number"
                step="0.01"
                defaultValue={profile.cpa_maximo_aceitavel ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ltv_estimado">LTV estimado ({currency})</Label>
              <Input id="ltv_estimado" name="ltv_estimado" type="number" step="0.01" defaultValue={profile.ltv_estimado ?? ""} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ciclo_de_venda_dias">Ciclo de venda (dias)</Label>
              <Input
                id="ciclo_de_venda_dias"
                name="ciclo_de_venda_dias"
                type="number"
                defaultValue={profile.ciclo_de_venda_dias ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="orcamento_mensal">Orçamento mensal ({currency})</Label>
              <Input
                id="orcamento_mensal"
                name="orcamento_mensal"
                type="number"
                step="0.01"
                defaultValue={profile.orcamento_mensal ?? ""}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="p-2">
        <CardContent className="flex flex-col gap-4 border-t border-outline-variant/30 pt-6">
          <label className={sectionLabelClass}>III. Estratégia &amp; Restrições</label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="estrategia">Estratégia atual</Label>
              <select id="estrategia" name="estrategia" defaultValue={profile.estrategia} className={selectClass}>
                <option value="">Selecione...</option>
                {ESTRATEGIAS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sazonalidade">Sazonalidade (1 por linha)</Label>
              <Textarea
                id="sazonalidade"
                name="sazonalidade"
                defaultValue={profile.sazonalidade.join("\n")}
                placeholder={"dia das mães\nblack friday"}
                rows={2}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="restricoes">Restrições (1 por linha)</Label>
            <Textarea
              id="restricoes"
              name="restricoes"
              defaultValue={profile.restricoes.join("\n")}
              placeholder={"nunca pausar a campanha 'Institucional'\nnão mexer em budget aos domingos"}
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notas_do_gestor">Notas do gestor</Label>
            <Textarea id="notas_do_gestor" name="notas_do_gestor" defaultValue={profile.notas_do_gestor} rows={2} />
          </div>
        </CardContent>
      </Card>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600 dark:text-emerald-400">Contexto salvo.</p>}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar contexto"}
      </Button>
    </form>
  );
}
