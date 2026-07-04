import { MetaClient } from "./client";

export interface MetaAdAccount {
  /** id no formato "act_123456789". */
  id: string;
  accountId: string;
  name: string;
  currency: string;
  timezoneName: string;
  accountStatus: number;
}

interface AdAccountsResponse {
  data: Array<{
    id: string;
    account_id?: string;
    name: string;
    currency: string;
    timezone_name: string;
    account_status: number;
  }>;
  paging?: { cursors?: { after?: string }; next?: string };
}

/** GET /me/adaccounts — lista contas acessíveis pelo token (PROJECT.md 5.3). */
export async function listAdAccounts(
  token: string,
  opts?: { apiVersion?: string },
): Promise<MetaAdAccount[]> {
  const client = new MetaClient({ accessToken: token, apiVersion: opts?.apiVersion });
  const accounts: MetaAdAccount[] = [];
  let after: string | undefined;

  do {
    const response = await client.get<AdAccountsResponse>("me/adaccounts", {
      fields: "id,account_id,name,account_status,currency,timezone_name",
      limit: 100,
      after,
    });

    for (const a of response.data) {
      accounts.push({
        id: a.id,
        accountId: a.account_id ?? a.id.replace("act_", ""),
        name: a.name,
        currency: a.currency,
        timezoneName: a.timezone_name,
        accountStatus: a.account_status,
      });
    }

    after = response.paging?.next ? response.paging.cursors?.after : undefined;
  } while (after);

  return accounts;
}
