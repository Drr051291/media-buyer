"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Wallet, ShieldCheck, Info, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type MetaAdAccount = {
  id: string;
  accountId: string;
  name: string;
  currency: string;
  timezoneName: string;
  accountStatus: number;
};

type Step = "instructions" | "token" | "accounts";

const ONBOARDING_STEPS = [
  {
    icon: Info,
    title: "1. Criar app Meta",
    body: 'developers.facebook.com → Create App → tipo "Business" → adicionar produto "Marketing API". Fica em Development mode, sem problema.',
  },
  {
    icon: Zap,
    title: "2. Criar System User",
    body: "No Business Manager: Configurações do Negócio → Usuários → Usuários do Sistema → Adicionar (tipo Admin ou Employee).",
  },
  {
    icon: Info,
    title: "3. Atribuir ativos ao System User",
    body: 'Adicione a(s) conta(s) de anúncio ao System User com permissão "Gerenciar campanhas" (ads_management).',
  },
  {
    icon: Zap,
    title: "4. Gerar token",
    body: 'No System User → Gerar Token → selecione o app → escopos ads_management, ads_read, business_management → expiração "Nunca".',
  },
];

export function ConnectWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("instructions");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleValidate() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/meta/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao validar token");

      setScopes(data.scopes);

      const accountsRes = await fetch("/api/meta/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const accountsData = await accountsRes.json();
      if (!accountsRes.ok) throw new Error(accountsData.error ?? "Falha ao listar contas");

      setAccounts(accountsData.accounts);
      setStep("accounts");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setPending(false);
    }
  }

  async function handleConnect() {
    setError(null);
    setPending(true);
    try {
      const selectedAccounts = accounts.filter((a) => selected.has(a.id));
      const res = await fetch("/api/meta/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, label, selectedAccounts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao conectar");

      router.push("/app/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setPending(false);
    }
  }

  function toggleAccount(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const currentStepIndex = step === "accounts" ? 2 : step === "token" ? 1 : 0;

  return (
    <div className="flex flex-col gap-8">
      <nav className="relative flex items-center justify-between px-6">
        <div className="absolute top-1/2 right-6 left-6 -z-10 h-0.5 bg-outline-variant opacity-30" />
        {["Autenticação", "Conta de Anúncios", "Verificação"].map((label, i) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <div
              className={`flex size-12 items-center justify-center rounded-full border shadow-sm transition-colors ${
                i <= currentStepIndex
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-outline-variant bg-surface-container-highest text-on-surface-variant"
              }`}
            >
              {i === 0 && <KeyRound className="size-5" />}
              {i === 1 && <Wallet className="size-5" />}
              {i === 2 && <ShieldCheck className="size-5" />}
            </div>
            <span className={`text-xs font-medium ${i <= currentStepIndex ? "text-primary" : "text-on-surface-variant"}`}>
              {label}
            </span>
          </div>
        ))}
      </nav>

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          {step === "instructions" && (
            <div className="flex flex-col gap-3">
              <h2 className="font-heading text-lg text-primary">Configuração do Token de Acesso</h2>
              <p className="text-sm text-on-surface-variant">
                O Meta Ads utiliza tokens de acesso de longa duração para permitir que o Copilot analise e otimize
                suas campanhas com segurança.
              </p>
              {ONBOARDING_STEPS.map((s) => (
                <div key={s.title} className="flex items-start gap-3 rounded-lg border border-outline-variant/50 bg-surface-bright p-3">
                  <s.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="text-sm text-on-surface-variant">
                    <p className="font-medium text-on-surface">{s.title}</p>
                    {s.body}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(step === "instructions" || step === "token") && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="label">Nome da conexão</Label>
                <Input
                  id="label"
                  placeholder="Ex: BM Cliente X"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="token">Seu Long-Lived User Access Token</Label>
                <Input
                  id="token"
                  type="password"
                  placeholder="EAAG..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                <p className="px-1 text-xs text-on-surface-variant italic">
                  Este token será criptografado e nunca compartilhado.
                </p>
              </div>
            </div>
          )}

          {step === "accounts" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {scopes.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-on-surface-variant">
                Selecione as contas que deseja conectar. Elas entram em modo <strong>Observador</strong> por padrão —
                você libera execução de ações depois.
              </p>
              <div className="flex flex-col gap-2">
                {accounts.map((account) => (
                  <label
                    key={account.id}
                    className="flex items-center gap-3 rounded-lg border border-outline-variant p-3 text-sm"
                  >
                    <Checkbox checked={selected.has(account.id)} onCheckedChange={() => toggleAccount(account.id)} />
                    <span className="flex-1">{account.name}</span>
                    <span className="text-on-surface-variant">
                      {account.currency} · {account.timezoneName}
                    </span>
                  </label>
                ))}
                {accounts.length === 0 && (
                  <p className="text-sm text-on-surface-variant">Nenhuma conta encontrada para este token.</p>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex justify-between border-t-0 bg-transparent">
          {step === "accounts" ? (
            <>
              <Button variant="outline" onClick={() => setStep("token")} disabled={pending}>
                Voltar
              </Button>
              <Button onClick={handleConnect} disabled={pending || selected.size === 0}>
                {pending ? "Conectando..." : `Conectar ${selected.size} conta(s)`}
              </Button>
            </>
          ) : (
            <Button className="ml-auto gap-2" onClick={handleValidate} disabled={pending || !token || !label}>
              {pending ? "Validando..." : "Continuar para Seleção de Conta"}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
