"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, ListChecks, ShieldCheck, ArrowRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AdAccount = { id: string; name: string };
type Property = { propertyId: string; displayName: string; account: string };
type Step = "connect" | "property" | "validate";
type TestSummary = { windowDays: number; sessions: number; conversions: number; revenue: number };

const OAUTH_ERROR_LABEL: Record<string, string> = {
  access_denied: "Você recusou a permissão. Autorize o acesso de leitura para conectar.",
  state_invalido: "A sessão do fluxo expirou. Tente conectar novamente.",
  sem_refresh_token: "O Google não devolveu o token de atualização. Reconecte para reconsentir.",
  nao_autorizado: "Apenas owner/admin da organização pode conectar.",
  falha_conexao: "Falha ao concluir a conexão. Tente novamente.",
};

const STEPS: { key: Step; label: string; icon: typeof Link2 }[] = [
  { key: "connect", label: "Conectar", icon: Link2 },
  { key: "property", label: "Propriedade", icon: ListChecks },
  { key: "validate", label: "Validar", icon: ShieldCheck },
];

export function Ga4Wizard({
  adAccounts,
  initialConnectionId,
  initialStep,
  oauthError,
  alreadyConfigured,
  currentPropertyName,
  currentPropertyId,
}: {
  adAccounts: AdAccount[];
  initialConnectionId: string | null;
  initialStep?: Step;
  oauthError: string | null;
  alreadyConfigured: boolean;
  currentPropertyName?: string | null;
  currentPropertyId?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep ?? "connect");
  const [connectionId] = useState<string | null>(initialConnectionId);
  const [linkAdAccount, setLinkAdAccount] = useState<string>("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const [error, setError] = useState<string | null>(
    oauthError ? (OAUTH_ERROR_LABEL[oauthError] ?? "Erro no fluxo de conexão.") : null,
  );
  const [pending, setPending] = useState(false);

  // Ao voltar do OAuth (step=property), carrega as propriedades acessíveis.
  useEffect(() => {
    if (step !== "property" || !connectionId) return;
    let active = true;
    async function loadProperties(id: string) {
      setPending(true);
      try {
        const res = await fetch(`/api/connectors/ga4/properties?connectionId=${id}`);
        const d = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(d.error ?? "Falha ao listar propriedades");
        setProperties(d.properties ?? []);
        if (d.selected) setSelectedProperty(d.selected);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Falha ao listar propriedades");
      } finally {
        if (active) setPending(false);
      }
    }
    void loadProperties(connectionId);
    return () => {
      active = false;
    };
  }, [step, connectionId]);

  function startOAuth() {
    const qs = linkAdAccount ? `?adAccountId=${linkAdAccount}` : "";
    // Redirect top-level: o consentimento do Google não abre em fetch/iframe.
    window.location.href = `/api/connectors/ga4/oauth/start${qs}`;
  }

  async function saveProperty() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/connectors/ga4/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          propertyId: selectedProperty,
          propertyName: properties.find((p) => p.propertyId === selectedProperty)?.displayName,
          adAccountId: linkAdAccount || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falha ao salvar propriedade");

      // Roda o relatório de teste (prova de vida) e vai para validação.
      const testRes = await fetch(`/api/connectors/ga4/confirm?connectionId=${connectionId}`);
      const testData = await testRes.json();
      if (!testRes.ok) throw new Error(testData.error ?? "Falha ao rodar relatório de teste");
      setSummary(testData);
      setStep("validate");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/connectors/ga4/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falha ao confirmar");
      router.push("/app/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setPending(false);
    }
  }

  const currentIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="flex flex-col gap-8">
      <nav className="relative flex items-center justify-between px-6">
        <div className="absolute top-1/2 right-6 left-6 -z-10 h-0.5 bg-outline-variant opacity-30" />
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex flex-col items-center gap-2">
            <div
              className={`flex size-12 items-center justify-center rounded-full border shadow-sm transition-colors ${
                i <= currentIndex
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-outline-variant bg-surface-container-highest text-on-surface-variant"
              }`}
            >
              <s.icon className="size-5" />
            </div>
            <span className={`text-xs font-medium ${i <= currentIndex ? "text-primary" : "text-on-surface-variant"}`}>
              {s.label}
            </span>
          </div>
        ))}
      </nav>

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          {step === "connect" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="font-heading text-lg text-primary">Autorizar leitura do GA4</h2>
                <p className="text-sm text-on-surface-variant">
                  Você será levado ao Google para autorizar o acesso <strong>somente-leitura</strong>{" "}
                  (<code>analytics.readonly</code>). Nenhuma configuração de infraestrutura é necessária.
                </p>
              </div>

              {adAccounts.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label>Vincular a uma conta Meta (opcional)</Label>
                  <Select value={linkAdAccount} onValueChange={(v) => setLinkAdAccount(v ?? "")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sem vínculo — cruzo depois" />
                    </SelectTrigger>
                    <SelectContent>
                      {adAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="px-1 text-xs text-on-surface-variant">
                    O vínculo liga as métricas do GA4 à conta de anúncios para a atribuição cruzada.
                  </p>
                </div>
              )}

              {alreadyConfigured && (
                <div className="rounded-lg border border-outline-variant/50 bg-surface-bright p-3 text-sm text-on-surface-variant">
                  {(currentPropertyName || currentPropertyId) && (
                    <p className="mb-1 text-on-surface">
                      Propriedade conectada:{" "}
                      <strong>{currentPropertyName ?? "Propriedade GA4"}</strong>
                      {currentPropertyId ? (
                        <span className="ml-1 font-mono text-xs text-on-surface-variant">
                          (ID: {currentPropertyId})
                        </span>
                      ) : null}
                    </p>
                  )}
                  Já existe uma conexão GA4. Reconectar substitui as credenciais sem duplicar a conexão.
                </div>
              )}
            </div>
          )}

          {step === "property" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="font-heading text-lg text-primary">Escolher propriedade</h2>
                <p className="text-sm text-on-surface-variant">
                  Selecione qual propriedade GA4 o Copiloto vai sincronizar.
                </p>
              </div>
              <Select value={selectedProperty} onValueChange={(v) => setSelectedProperty(v ?? "")} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder={pending ? "Carregando..." : "Selecione a propriedade"} />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.propertyId} value={p.propertyId}>
                      {p.displayName} {p.account ? `· ${p.account}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!pending && properties.length === 0 && (
                <p className="text-sm text-on-surface-variant">
                  Nenhuma propriedade acessível por esta conta Google.
                </p>
              )}
            </div>
          )}

          {step === "validate" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="font-heading text-lg text-primary">Validar e conectar</h2>
                <p className="text-sm text-on-surface-variant">
                  Rodamos um relatório de teste dos últimos {summary?.windowDays ?? 28} dias.
                </p>
              </div>
              {summary && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Sessões", value: summary.sessions.toLocaleString("pt-BR") },
                    { label: "Conversões", value: summary.conversions.toLocaleString("pt-BR") },
                    {
                      label: "Receita",
                      value: summary.revenue.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }),
                    },
                  ].map((tile) => (
                    <div
                      key={tile.label}
                      className="flex flex-col gap-1 rounded-lg border border-outline-variant/50 bg-surface-bright p-4"
                    >
                      <span className="text-xs text-on-surface-variant">{tile.label}</span>
                      <span className="font-heading text-xl text-on-surface">{tile.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="flex items-center gap-2 text-sm text-on-surface-variant">
                <TrendingUp className="size-4 text-primary" />
                Ao confirmar, agendamos o backfill de 90 dias e a sincronização diária.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>

        <CardFooter className="flex justify-between border-t-0 bg-transparent">
          {step === "connect" && (
            <Button className="ml-auto gap-2" onClick={startOAuth} disabled={pending}>
              Conectar Google Analytics
              <ArrowRight className="size-4" />
            </Button>
          )}
          {step === "property" && (
            <Button
              className="ml-auto gap-2"
              onClick={saveProperty}
              disabled={pending || !selectedProperty}
            >
              {pending ? "Validando..." : "Continuar"}
              <ArrowRight className="size-4" />
            </Button>
          )}
          {step === "validate" && (
            <>
              <Button variant="outline" onClick={() => setStep("property")} disabled={pending}>
                Voltar
              </Button>
              <Button onClick={confirm} disabled={pending}>
                {pending ? "Conectando..." : "Confirmar conexão"}
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
