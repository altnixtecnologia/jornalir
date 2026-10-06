import type { SupabaseClient } from "@supabase/supabase-js";
import { DraftService, IssuerConfigService, ServiceProfileService } from "@ir/core";
import { createIssuerConfigRepositorySupabase } from "../providers/supabase/nfseIssuerConfigRepository.supabase";
import { createServiceProfileRepositorySupabase } from "../providers/supabase/nfseServiceProfileRepository.supabase";
import { createDraftRepositorySupabase } from "../providers/supabase/nfseDraftRepository.supabase";

// Ponto de composição do módulo NFS-e — fábrica, nunca singleton de
// módulo (mesmo princípio de composition/financeiro.ts e composition/clientes.ts).
export function getIssuerConfigService(client: SupabaseClient): IssuerConfigService {
  return new IssuerConfigService(createIssuerConfigRepositorySupabase(client));
}

export function getServiceProfileService(client: SupabaseClient): ServiceProfileService {
  return new ServiceProfileService(createServiceProfileRepositorySupabase(client));
}

export function getDraftService(client: SupabaseClient): DraftService {
  return new DraftService(createDraftRepositorySupabase(client));
}
