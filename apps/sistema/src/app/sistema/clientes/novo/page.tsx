import { ClientForm } from "../../../../features/clientes/ClientForm";

import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export default async function NovoClientePage(): Promise<JSX.Element> {
  const { data: canSelectInformativo } = await createSupabaseServerClient().rpc("is_active_admin_or_owner");
  return (
    <>
      <header className="cadastros-header">
        <div>
          <p className="eyebrow">CADASTROS / NOVO</p>
          <h1>Novo cadastro</h1>
          <p className="cadastros-header-desc">Identificação, contato, endereço e papéis em um só lugar.</p>
        </div>
      </header>
      <ClientForm mode="create" canSelectInformativo={canSelectInformativo === true} />
    </>
  );
}
