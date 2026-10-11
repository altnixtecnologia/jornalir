import type { SupabaseClient } from "@supabase/supabase-js";
import { CommercialProductService, CommercialProposalService, CommercialSaleService } from "@ir/core";
import { createCommercialProductRepositorySupabase } from "../providers/supabase/commercialProductRepository.supabase";
import { createCommercialSaleRepositorySupabase } from "../providers/supabase/commercialSaleRepository.supabase";
import { createCommercialProposalRepositorySupabase } from "../providers/supabase/commercialProposalRepository.supabase";

// Ponto de composição do módulo Comercial/Publicidade — fábrica, nunca
// singleton de módulo (mesmo princípio de composition/financeiro.ts e
// composition/nfse.ts).
export function getCommercialProductService(client: SupabaseClient): CommercialProductService {
  return new CommercialProductService(createCommercialProductRepositorySupabase(client));
}

export function getCommercialSaleService(client: SupabaseClient): CommercialSaleService {
  return new CommercialSaleService(createCommercialSaleRepositorySupabase(client));
}

export function getCommercialProposalService(client: SupabaseClient): CommercialProposalService {
  return new CommercialProposalService(createCommercialProposalRepositorySupabase(client));
}
