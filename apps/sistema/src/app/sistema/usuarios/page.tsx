import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { UsersManager } from "../../../features/usuarios/UsersManager";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { isLocalPreviewEnabled } from "../../../lib/auth/localPreview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Só proprietário e administradores efetivamente autorizados podem abrir a gestão de pessoas. */
export default async function UsuariosPage(): Promise<JSX.Element> {
  if (!isLocalPreviewEnabled()) {
    const client = createSupabaseServerClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) notFound();
    // O banco também confere staff_memberships, conta ativa, papel e e-mail confirmado.
    const { data: allowed, error: grantError } = await client.rpc("is_active_admin_or_owner");
    if (grantError || allowed !== true) notFound();
  }
  return (
    <>
      <ModuleHeader
        eyebrow="ADMINISTRAÇÃO / USUÁRIOS"
        title="Usuários"
        description="Quem tem acesso ao painel — papel, status e criação."
      />
      <UsersManager />
    </>
  );
}
