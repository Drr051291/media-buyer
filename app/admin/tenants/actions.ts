"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/auth/require-org";

/** Kill switch de tenant (PROJECT.md 2.2/6.5): suspende/reativa toda a organização. */
export async function toggleOrgStatus(orgId: string, newStatus: "active" | "suspended"): Promise<void> {
  await requirePlatformAdmin();

  const supabase = await createClient();
  await supabase.from("organizations").update({ status: newStatus }).eq("id", orgId);

  revalidatePath("/admin/tenants");
}
