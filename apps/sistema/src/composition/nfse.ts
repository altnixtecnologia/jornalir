import type { SupabaseClient } from "@supabase/supabase-js";
import { DraftService, FetchNationalNfseProvider, IssuerConfigService, ServiceProfileService } from "@ir/core";
// Importado por caminho direto (nunca pelo barrel de @ir/core) — ver
// comentário em packages/core/src/nfse/index.ts: transmission-service
// usa node:crypto (via signature.ts) e nunca pode entrar no bundle de
// um componente "use client".
import { TransmissionService } from "@ir/core/src/nfse/transmission-service";
import { createIssuerConfigRepositorySupabase } from "../providers/supabase/nfseIssuerConfigRepository.supabase";
import { createServiceProfileRepositorySupabase } from "../providers/supabase/nfseServiceProfileRepository.supabase";
import { createDraftRepositorySupabase } from "../providers/supabase/nfseDraftRepository.supabase";
import { createDpsSequenceRepositorySupabase } from "../providers/supabase/nfseDpsSequenceRepository.supabase";
import { createIssuedNoteRepositorySupabase } from "../providers/supabase/nfseIssuedNoteRepository.supabase";
import { createTransmissionAttemptRepositorySupabase } from "../providers/supabase/nfseTransmissionAttemptRepository.supabase";
import { createServerCertificateSigningProvider } from "../lib/nfse/certificateSigningProvider";

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

/**
 * Transmissão nacional (Parte 2A) — nunca chamada de fato nesta fase
 * (sem certificado real configurado, sem transmissão real à API
 * Nacional). Montada aqui já de ponta a ponta pra quando a extração de
 * certificado (ver certificateSigningProvider.ts) for implementada.
 */
export function getTransmissionService(client: SupabaseClient): TransmissionService {
  return new TransmissionService(
    createDraftRepositorySupabase(client),
    createIssuerConfigRepositorySupabase(client),
    createDpsSequenceRepositorySupabase(client),
    createIssuedNoteRepositorySupabase(client),
    createTransmissionAttemptRepositorySupabase(client),
    new FetchNationalNfseProvider(),
    createServerCertificateSigningProvider(),
  );
}
