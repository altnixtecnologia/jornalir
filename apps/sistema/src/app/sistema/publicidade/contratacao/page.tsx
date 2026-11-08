import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { toClientSearchResult } from "../../../../components/admin/clientSearchTypes";
import { getClientService } from "../../../../composition/clientes";
import { getCommercialProductService } from "../../../../composition/comercial";
import { getContractTemplateService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { checkFinanceAction } from "../../../../lib/permissions/checkFinanceAction";
import { checkModuleAction } from "../../../../lib/permissions/checkModuleAction";
import { ContractCompositionBuilder } from "../../../../features/contratacao/ContractCompositionBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/**
 * Montagem de contratação — Comercial → Nova contratação. Parte do cadastro
 * único do cliente (`?clientId=` vem do botão "Nova contratação" na ficha do
 * cliente). Comercial exige `contratos_preparar`; Institucional exige a
 * permissão financeira `contratos_criar`. Só gera MINUTA; nada é gravado,
 * assinado, enviado ou cobrado.
 */
export default async function ContractCompositionPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const [commercialDenied, institutionalDenied, proposalDenied, negotiateDenied] = await Promise.all([
    checkModuleAction("publicidade", "contratos_preparar"),
    checkFinanceAction("contratos_criar"),
    checkModuleAction("publicidade", "propostas_criar"),
    checkModuleAction("publicidade", "valores_negociar"),
  ]);
  const canCommercial = commercialDenied === null;
  const canInstitutional = institutionalDenied === null;

  if (!canCommercial && !canInstitutional) {
    return (
      <>
        <ModuleHeader eyebrow="COMERCIAL / CONTRATAÇÃO" title="Nova contratação" description="Acesso restrito." />
        <section className="form-section form-section--first">
          <p className="helper-text" role="alert">Você não tem permissão para montar contratações.</p>
        </section>
      </>
    );
  }

  const initialClientId = one(searchParams?.clientId) || undefined;
  const [templates, products, initialClient] = await Promise.all([
    getContractTemplateService(supabase).listCurrentVersions(),
    getCommercialProductService(supabase).list({ activeOnly: true }),
    initialClientId
      ? getClientService(supabase).getById(initialClientId).then(toClientSearchResult).catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <>
      <ModuleHeader
        eyebrow="COMERCIAL / CONTRATAÇÃO"
        title="Nova contratação"
        description="Cliente, modalidade, modelo e serviços no mesmo documento, com valores negociados por item. Gera minuta para conferência."
      />
      <ContractCompositionBuilder
        templates={templates}
        products={products}
        initialClient={initialClient}
        canCommercial={canCommercial}
        canInstitutional={canInstitutional}
        canCreateProposal={proposalDenied === null}
        canNegotiate={negotiateDenied === null}
      />
    </>
  );
}
