"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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
    title: "1. Criar app Meta",
    body: "developers.facebook.com → Create App → tipo \"Business\" → adicionar produto \"Marketing API\". Fica em Development mode, sem problema.",
  },
  {
    title: "2. Criar System User",
    body: "No Business Manager: Configurações do Negócio → Usuários → Usuários do Sistema → Adicionar (tipo Admin ou Employee).",
  },
  {
    title: "3. Atribuir ativos ao System User",
    body: "Adicione a(s) conta(s) de anúncio ao System User com permissão \"Gerenciar campanhas\" (ads_management).",
  },
  {
    title: "4. Gerar token",
    body: "No System User → Gerar Token → selecione o app → escopos ads_management, ads_read, business_management → expiração \"Nunca\".",
  },
  {
    title: "5. Colar o token abaixo",
    body: "Cole o token gerado no campo abaixo para validarmos e listarmos suas contas.",
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conectar conta Meta (BYOT)</CardTitle>
        <CardDescription>
          Gere um token de System User no seu próprio Business Manager — sem App
          Review, sem espera.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {step === "instructions" && (
          <div className="flex flex-col gap-4">
            {ONBOARDING_STEPS.map((s) => (
              <div key={s.title}>
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        )}

        {(step === "instructions" || step === "token") && (
          <div className="flex flex-col gap-4">
            <Separator />
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
              <Label htmlFor="token">Token de acesso</Label>
              <Input
                id="token"
                type="password"
                placeholder="EAAG..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
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
            <p className="text-sm text-muted-foreground">
              Selecione as contas que deseja conectar. Elas entram em modo{" "}
              <strong>Observador</strong> por padrão — você libera execução de ações
              depois.
            </p>
            <div className="flex flex-col gap-2">
              {accounts.map((account) => (
                <label
                  key={account.id}
                  className="flex items-center gap-3 rounded-md border p-3 text-sm"
                >
                  <Checkbox
                    checked={selected.has(account.id)}
                    onCheckedChange={() => toggleAccount(account.id)}
                  />
                  <span className="flex-1">{account.name}</span>
                  <span className="text-muted-foreground">
                    {account.currency} · {account.timezoneName}
                  </span>
                </label>
              ))}
              {accounts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma conta encontrada para este token.
                </p>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="flex justify-between">
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
          <Button
            className="ml-auto"
            onClick={handleValidate}
            disabled={pending || !token || !label}
          >
            {pending ? "Validando..." : "Validar e listar contas"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
