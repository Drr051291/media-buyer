"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, ListChecks, ShieldCheck, ArrowRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Account = {
  externalId: string;
  name: string;
  currency: string;
  timezone: string;
  isManager?: boolean;
};
type Step = "connect" | "account" | "validate";
type TestSummary = { windowDays: number; activeCampaigns: number; spend: number; conversions: number };

const OAUTH_ERROR_LABEL: Record<string, string> = {
  access_denied: "Você recusou a permissão. Autorize o acesso para conectar.",
  state_invalido: "A sessão do fluxo expirou. Tente conectar novamente.",
  sem_refresh_token: "O Google não devolveu o token de atualização. Reconecte para reconsentir.",
  nao_autorizado: "Apenas owner/admin da organização pode conectar.",
  falha_conexao: "Falha ao concluir a conexão. Tente novamente.",
};

const STEPS: { key: Step; label: string; icon: typeof Link2 }[] = [
  { key: "connect", label: "Conectar", icon: Link2 },
  { key: "account", label: "Conta", icon: ListChecks },
  { key: "validate", label: "Validar", icon: ShieldCheck },
];

export function GoogleAdsWizard({
  initialTokenId,
  initialStep,
  oauthError,
}: {
  initialTokenId: string | null;
  initialStep?: Step;
  oauthError: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep ?? "connect");
  const [tokenId] = useState<string | null>(initialTokenId);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const [error, setError] = useState<string | null>(
    oauthError ? (OAUTH_ERROR_LABEL[oauthError] ?? "Erro no fluxo de conexão.") : null,
  );
  const [pending, setPending] = useState(false);

  // Ao voltar do OAuth (step=account), carrega as contas acessíveis.
  useEffect(() => {
    if (step !== "account" || !tokenId) return;
    let active = true;
    async function load(id: string) {
      setPending(true);
      try {
        const res = await fetch(`/api/providers/google-ads/accounts?tokenId=${id}`);
        const d = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(d.error ?? "Falha ao listar contas");
        setAccounts(d.accounts ?? []);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Falha ao listar contas");
      } finally {
        if (active) setPending(false);
      }
    }
    void load(tokenId);
    return () => {
      active = false;
    };
  }, [step, tokenId]);

  function startOAuth() {
    // Redirect top-level: o consentimento do Google não abre em fetch/iframe.
    window.location.href = "/api/providers/google-ads/oauth/start";
  }

  async function validateAccount() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/providers/google-ads/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId, customerId: selected }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falha ao validar a conta");
      setSummary(d);
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
      const account = accounts.find((a) => a.externalId === selected);
      if (!account) throw new Error("Conta não selecionada");
      const res = await fetch("/api/providers/google-ads/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId,
          selectedAccounts: [
            {
              customerId: account.externalId,
              name: account.name,
              currency: account.currency,
              timezone: account.timezone,
            },
          ],
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falha ao conectar");
      router.push("/app/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setPending(false);
    }
  }

  const currentIndex = STEPS.findIndex((s) => s.key === step);
  const selectableAccounts = accounts.filter((a) => !a.isManager);

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
                <h2 className="font-heading text-lg text-primary">Autorizar o Google Ads</h2>
                <p className="text-sm text-on-surface-variant">
                  Você será levado ao Google para autorizar o acesso à sua conta de anúncios
                  (<code>adwords</code>). Sem colar tokens — é OAuth, como no Google Analytics.
                </p>
              </div>
            </div>
          )}

          {step === "account" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="font-heading text-lg text-primary">Escolher a conta</h2>
                <p className="text-sm text-on-surface-variant">
                  Selecione qual conta Google Ads o Copiloto vai sincronizar.
                </p>
              </div>
              <Select value={selected} onValueChange={(v) => setSelected(v ?? "")} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder={pending ? "Carregando..." : "Selecione a conta"} />
                </SelectTrigger>
                <SelectContent>
                  {selectableAccounts.map((a) => (
                    <SelectItem key={a.externalId} value={a.externalId}>
                      {a.name} · {a.externalId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!pending && selectableAccounts.length === 0 && (
                <p className="text-sm text-on-surface-variant">
                  Nenhuma conta operável acessível por esta credencial (contas gestoras/MCC não
                  aparecem aqui na V1).
                </p>
              )}
            </div>
          )}

          {step === "validate" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="font-heading text-lg text-primary">Validar e conectar</h2>
                <p className="text-sm text-on-surface-variant">
                  Rodamos um relatório de teste dos últimos {summary?.windowDays ?? 7} dias.
                </p>
              </div>
              {summary && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Campanhas ativas", value: summary.activeCampaigns.toLocaleString("pt-BR") },
                    {
                      label: "Investimento (7d)",
                      value: summary.spend.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
                    },
                    { label: "Conversões (7d)", value: summary.conversions.toLocaleString("pt-BR") },
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
              Conectar Google Ads
              <ArrowRight className="size-4" />
            </Button>
          )}
          {step === "account" && (
            <Button className="ml-auto gap-2" onClick={validateAccount} disabled={pending || !selected}>
              {pending ? "Validando..." : "Continuar"}
              <ArrowRight className="size-4" />
            </Button>
          )}
          {step === "validate" && (
            <>
              <Button variant="outline" onClick={() => setStep("account")} disabled={pending}>
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
