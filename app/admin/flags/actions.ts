"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/auth/require-org";

export async function setFeatureFlag(orgId: string, flag: string, enabled: boolean): Promise<void> {
  await requirePlatformAdmin();

  const supabase = await createClient();
  await supabase
    .from("feature_flags")
    .upsert({ org_id: orgId, flag, enabled, updated_at: new Date().toISOString() }, { onConflict: "org_id,flag" });

  revalidatePath("/admin/flags");
}
