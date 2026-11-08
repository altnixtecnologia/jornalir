import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { getContractTemplateService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { requireAdminOrOwner } from "../../../../lib/auth/requireAdminOrOwner";
import { checkFinanceAction } from "../../../../lib/permissions/checkFinanceAction";
import { ContractTemplatesManager } from "../../../../features/financeiro/ContractTemplatesManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Configurações → Modelos de contratos. Mesmo gerenciador e mesmas tabelas
 * de Financeiro → Modelos de contrato (nenhum cadastro paralelo): aqui só
 * ganha o endereço dentro de Configurações. Exige a permissão financeira
 * `contratos_editar` (ou administrador/proprietário); aprovar e ativar para
 * produção é só do administrador/proprietário.
 */
export default async function ContractTemplatesSettingsPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const denied = await checkFinanceAction("contratos_editar");
  if (denied) {
    return (
      <>
        <ModuleHeader eyebrow="CONFIGURAÇÕES / CONTRATOS" title="Modelos de contratos" description="Acesso restrito." />
        <section className="form-section form-section--first">
          <p className="helper-text" role="alert">Você não tem permissão para gerenciar modelos de contratos.</p>
        </section>
      </>
    );
  }
  const [templates, admin] = await Promise.all([
    getContractTemplateService(supabase).listCurrentVersions(),
    requireAdminOrOwner(supabase),
  ]);

  return (
    <>
      <ModuleHeader
        eyebrow="CONFIGURAÇÕES / CONTRATOS"
        title="Modelos de contratos"
        description="Modelos comerciais e institucionais, inclusive específicos para licitações. Versões, modo de teste e aprovação jurídica antes da produção."
      />
      <ContractTemplatesManager templates={templates} canApprove={admin.ok} />
    </>
  );
}
