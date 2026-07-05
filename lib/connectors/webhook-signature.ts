import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Assinatura HMAC do webhook genérico de entrada (ETAPA2.md 2.4). Convenção
 * própria (não é a assinatura nativa de nenhum vendor): o chamador (ex:
 * blueprint Make/n8n) calcula sha256=HMAC-SHA256(segredo, corpo_bruto) e
 * envia no header X-Copiloto-Signature.
 */
export function computeWebhookSignature(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/** Comparação em tempo constante — mesmo cuidado do requireCronSecret. */
export function verifyWebhookSignature(secret: string, rawBody: string, providedSignature: string | null): boolean {
  if (!providedSignature) return false;

  const expected = computeWebhookSignature(secret, rawBody);
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(providedSignature);
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
