"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, ShieldCheck, ArrowRight, KeyRound, Users, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
type Step = "connect" | "validate";
type TestSummary = { windowDays: number; contacts: number; deals: number; portalId: string | null };

const OAUTH_ERROR_LABEL: Record<string, string> = {
  access_denied: "Você recusou a autorização. Autorize o acesso de leitura para conectar.",
  state_invalido: "A sessão do fluxo expirou. Tente conectar novamente.",
  sem_refresh_token: "O HubSpot não devolveu o token de atualização. Tente novamente.",
  nao_autorizado: "Apenas owner/admin da organização pode conectar.",
  portal_em_uso: "Este portal HubSpot já está conectado a outra organização.",
  falha_conexao: "Falha ao concluir a conexão. Tente novamente.",
};

const STEPS: { key: Step; label: string; icon: typeof Link2 }[] = [
  { key: "connect", label: "Conectar", icon: Link2 },
  { key: "validate", label: "Validar", icon: ShieldCheck },
];

export function HubspotWizard({
  adAccounts,
  initialConnectionId,
  initialStep,
  oauthError,
  alreadyConfigured,
}: {
  adAccounts: AdAccount[];
  initialConnectionId: string | null;
  initialStep?: Step;
  oauthError: string | null;
  alreadyConfigured: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep ?? "connect");
  const [connectionId, setConnectionId] = useState<string | null>(initialConnectionId);
  const [linkAdAccount, setLinkAdAccount] = useState<string>("");
  const [showTokenPath, setShowTokenPath] = useState(false);
  const [privateToken, setPrivateToken] = useState("");
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const [error, setError] = useState<string | null>(
    oauthError ? (OAUTH_ERROR_LABEL[oauthError] ?? "Erro no fluxo de conexão.") : null,
  );
  const [pending, setPending] = useState(false);

  // Ao voltar do OAuth (step=validate), roda o teste de acesso.
  useEffect(() => {
    if (step !== "validate" || !connectionId || summary) return;
    let active = true;
    async function loadSummary(id: string) {
      setPending(true);
      try {
        const res = await fetch(`/api/connectors/hubspot/confirm?connectionId=${id}`);
        const d = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(d.error ?? "Falha ao rodar teste de acesso");
        setSummary(d);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Falha ao rodar teste de acesso");
      } finally {
        if (active) setPending(false);
      }
    }
    void loadSummary(connectionId);
    return () => {
      active = false;
    };
  }, [step, connectionId, summary]);

  function startOAuth() {
    const qs = linkAdAccount ? `?adAccountId=${linkAdAccount}` : "";
    // Redirect top-level: a autorização do HubSpot não abre em fetch/iframe.
    window.location.href = `/api/connectors/hubspot/oauth/start${qs}`;
  }

  async function connectWithToken() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/connectors/hubspot/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: privateToken.trim(),
          adAccountId: linkAdAccount || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falha ao validar o token");
      setPrivateToken(""); // nunca manter o token no estado além do necessário
      setConnectionId(d.connectionId);
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
      const res = await fetch("/api/connectors/hubspot/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falha ao confirmar");
      router.push("/app/integrations");
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
                <h2 className="font-heading text-lg text-primary">Autorizar leitura do HubSpot</h2>
                <p className="text-sm text-on-surface-variant">
                  Você será levado ao HubSpot para autorizar o acesso <strong>somente-leitura</strong>{" "}
                  a contatos, negócios e reuniões. Nada é escrito no seu CRM.
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
                    O vínculo liga os leads e negócios do CRM à conta de anúncios para a atribuição cruzada.
                  </p>
                </div>
              )}

              {alreadyConfigured && (
                <p className="rounded-lg border border-outline-variant/50 bg-surface-bright p-3 text-sm text-on-surface-variant">
                  Já existe uma conexão HubSpot. Reconectar substitui as credenciais sem duplicar a conexão.
                </p>
              )}

              <button
                type="button"
                onClick={() => setShowTokenPath((v) => !v)}
                className="flex items-center gap-2 self-start text-sm text-primary underline-offset-4 hover:underline"
              >
                <KeyRound className="size-4" />
                {showTokenPath ? "Prefiro autorizar com login (OAuth)" : "Não consigo autorizar? Cole um token de Private App"}
              </button>

              {showTokenPath && (
                <div className="flex flex-col gap-2 rounded-lg border border-outline-variant/50 bg-surface-bright p-4">
                  <Label htmlFor="hubspot-token">Token do Private App</Label>
                  <Input
                    id="hubspot-token"
                    type="password"
                    autoComplete="off"
                    placeholder="pat-na1-..."
                    value={privateToken}
                    onChange={(e) => setPrivateToken(e.target.value)}
                  />
                  <p className="text-xs text-on-surface-variant">
                    No HubSpot: Configurações → Integrações → Private Apps → Criar app com os escopos{" "}
                    <code>crm.objects.contacts.read</code>, <code>crm.objects.deals.read</code> e{" "}
                    <code>crm.objects.companies.read</code>. O token fica criptografado no nosso cofre e
                    nunca aparece de novo.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === "validate" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="font-heading text-lg text-primary">Validar e conectar</h2>
                <p className="text-sm text-on-surface-variant">
                  Teste de acesso ao portal {summary?.portalId ?? "..."}: atividade dos últimos{" "}
                  {summary?.windowDays ?? 28} dias.
                </p>
              </div>
              {summary && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Contatos ativos", value: summary.contacts.toLocaleString("pt-BR"), icon: Users },
                    { label: "Negócios ativos", value: summary.deals.toLocaleString("pt-BR"), icon: Handshake },
                  ].map((tile) => (
                    <div
                      key={tile.label}
                      className="flex flex-col gap-1 rounded-lg border border-outline-variant/50 bg-surface-bright p-4"
                    >
                      <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <tile.icon className="size-3.5" />
                        {tile.label}
                      </span>
                      <span className="font-heading text-xl text-on-surface">{tile.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-sm text-on-surface-variant">
                Ao confirmar, importamos 180 dias de leads, reuniões e negócios e mantemos tudo
                sincronizado diariamente (e em tempo quase real via webhook, se configurado).
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>

        <CardFooter className="flex justify-between border-t-0 bg-transparent">
          {step === "connect" &&
            (showTokenPath ? (
              <Button
                className="ml-auto gap-2"
                onClick={connectWithToken}
                disabled={pending || privateToken.trim().length < 20}
              >
                {pending ? "Validando token..." : "Validar e continuar"}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button className="ml-auto gap-2" onClick={startOAuth} disabled={pending}>
                Conectar HubSpot
                <ArrowRight className="size-4" />
              </Button>
            ))}
          {step === "validate" && (
            <>
              <Button variant="outline" onClick={() => setStep("connect")} disabled={pending}>
                Voltar
              </Button>
              <Button onClick={confirm} disabled={pending || !summary}>
                {pending ? "Conectando..." : "Confirmar conexão"}
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
