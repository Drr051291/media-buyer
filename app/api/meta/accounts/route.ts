import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { listAdAccounts } from "@/lib/meta/accounts";
import { MetaApiError } from "@/lib/meta/client";

const bodySchema = z.object({ token: z.string().min(20) });

export async function POST(request: Request) {
  try {
    await requireOrgAdmin();

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Token ausente ou inválido" }, { status: 400 });
    }

    const accounts = await listAdAccounts(parsed.data.token);
    return NextResponse.json({ accounts });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof MetaApiError) {
      return NextResponse.json({ error: `Meta: ${error.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: "Erro ao listar contas" }, { status: 500 });
  }
}
