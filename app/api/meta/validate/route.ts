import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { validateToken, hasMinimumScope } from "@/lib/meta/debug-token";
import { MetaApiError } from "@/lib/meta/client";

const bodySchema = z.object({ token: z.string().min(20) });

export async function POST(request: Request) {
  try {
    await requireOrgAdmin();

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Token ausente ou inválido" }, { status: 400 });
    }

    const health = await validateToken(parsed.data.token);

    if (!health.isValid) {
      return NextResponse.json({ error: "Token inválido ou expirado" }, { status: 422 });
    }
    if (!hasMinimumScope(health.scopes)) {
      return NextResponse.json(
        { error: "Token sem escopo mínimo (ads_read). Verifique as permissões do System User." },
        { status: 422 },
      );
    }

    return NextResponse.json({
      isValid: health.isValid,
      scopes: health.scopes,
      expiresAt: health.expiresAt,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof MetaApiError) {
      return NextResponse.json({ error: `Meta: ${error.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: "Erro ao validar token" }, { status: 500 });
  }
}
