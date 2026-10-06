import type { SupabaseClient } from "@supabase/supabase-js";
import { DraftService, FetchNationalNfseProvider, IssuerConfigService, ServiceProfileService } from "@ir/core";
// Importados por caminho direto (nunca pelo barrel de @ir/core) — ver
// comentário em packages/core/src/nfse/index.ts: usam dependências
// Node-only (node:crypto, node-forge, xml-crypto, xmllint-wasm) e
// nunca podem entrar no bundle de um componente "use client".
import { TransmissionService } from "@ir/core/src/nfse/transmission-service";
import { CertificateService } from "@ir/core/src/nfse/certificate-service";
import { createIssuerConfigRepositorySupabase } from "../providers/supabase/nfseIssuerConfigRepository.supabase";
import { createServiceProfileRepositorySupabase } from "../providers/supabase/nfseServiceProfileRepository.supabase";
import { createDraftRepositorySupabase } from "../providers/supabase/nfseDraftRepository.supabase";
import { createDpsSequenceRepositorySupabase } from "../providers/supabase/nfseDpsSequenceRepository.supabase";
import { createIssuedNoteRepositorySupabase } from "../providers/supabase/nfseIssuedNoteRepository.supabase";
import { createTransmissionAttemptRepositorySupabase } from "../providers/supabase/nfseTransmissionAttemptRepository.supabase";
import { createCertificateRepositorySupabase } from "../providers/supabase/nfseCertificateRepository.supabase";

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

/** Certificado digital A1 (Parte 2B) — PFX validado, chave privada criptografada (ver certificate-service.ts/secret-store.ts). */
export function getCertificateService(client: SupabaseClient): CertificateService {
  return new CertificateService(createCertificateRepositorySupabase(client));
}

/**
 * Transmissão nacional (Parte 2A/2B) — nunca chamada de fato nesta
 * fase (XSD real ainda não valida a DPS gerada, ver dps-builder.ts/
 * xsd-validator.ts; `FetchNationalNfseProvider` bloqueia toda chamada
 * de propósito). Montada aqui já de ponta a ponta.
 */
export function getTransmissionService(client: SupabaseClient): TransmissionService {
  return new TransmissionService(
    createDraftRepositorySupabase(client),
    createIssuerConfigRepositorySupabase(client),
    createDpsSequenceRepositorySupabase(client),
    createIssuedNoteRepositorySupabase(client),
    createTransmissionAttemptRepositorySupabase(client),
    new FetchNationalNfseProvider(),
    getCertificateService(client),
  );
}
