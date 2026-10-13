"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const PATH = "/sistema/notificacoes";

export async function markNotificationReadAction(id: string): Promise<void> {
  const client = createSupabaseServerClient();
  const { error } = await client
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const client = createSupabaseServerClient();
  const { error } = await client
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}
