import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NfseEnvironment } from "@ir/types";
import { SefinNacionalNationalNfseProvider, RealTransmissionNotReadyError, type NationalNfseProvider } from "@ir/core/src/nfse/national-nfse-provider";
import { SefinNacionalClient } from "@ir/core/src/nfse/sefin-nacional-client";
import { createMutualTlsDispatcher } from "@ir/core/src/nfse/mutual-tls";
import { CertificateNotConfiguredError, TransmissionService } from "@ir/core/src/nfse/transmission-service";
import type { NationalNfseResponseEnvelope } from "@ir/core/src/nfse/dps-builder";
import { createDraftRepositorySupabase } from "../providers/supabase/nfseDraftRepository.supabase";
import { createIssuerConfigRepositorySupabase } from "../providers/supabase/nfseIssuerConfigRepository.supabase";
import { createDpsSequenceRepositorySupabase } from "../providers/supabase/nfseDpsSequenceRepository.supabase";
import { createIssuedNoteRepositorySupabase } from "../providers/supabase/nfseIssuedNoteRepository.supabase";
import { createTransmissionAttemptRepositorySupabase } from "../providers/supabase/nfseTransmissionAttemptRepository.supabase";
import { getCertificateService, getIssuerConfigService } from "./nfse";
import { assertRestrictedSefinEnvironment, restrictedSefinEnvironmentFromServer } from "../lib/nfse/restrictedSefinGate";

/**
 * Adaptador PENDENTE de habilitacao: prepara o mTLS sob demanda com o
 * certificado A1 guardado no cofre do servidor. Fecha o Agent em finally,
 * nao grava chave em logs e nao aceita host/ambiente escolhidos pelo usuario.
 *
 * ATENCAO: esta composicao NAO e chamada em nenhuma rota/server action.
 * A composicao oficial continua com FetchNationalNfseProvider, bloqueado.
 * Ela sera usada somente apos A1, deploy de homologacao SEGREGADO e
 * autorizacao expressa do responsavel para testes na SEFIN restrita.
 */
class RestrictedSefinProvider implements NationalNfseProvider {
  constructor(private readonly sessionClient: SupabaseClient) {}

  private async execute<T>(
    environment: NfseEnvironment,
    fn: (provider: SefinNacionalNationalNfseProvider) => Promise<T>,
  ): Promise<T> {
    assertRestrictedSefinEnvironment(restrictedSefinEnvironmentFromServer());
    if (environment !== "homologation") {
      throw new Error("Produção fiscal bloqueada: somente SEFIN Produção Restrita.");
    }
    const issuer = await getIssuerConfigService(this.sessionClient).getCurrent();
    if (!issuer || issuer.environment !== "homologation") {
      throw new Error("Prestador precisa estar configurado para Produção Restrita.");
    }
    const material = await getCertificateService().getActiveSigningMaterial(issuer.id);
    if (!material) throw new CertificateNotConfiguredError();

    const dispatcher = createMutualTlsDispatcher(material.certificatePem, material.privateKeyPem);
    try {
      const provider = new SefinNacionalNationalNfseProvider(new SefinNacionalClient(dispatcher));
      return await fn(provider);
    } finally {
      await dispatcher.close();
    }
  }

  async getMunicipalParameters(): Promise<never> {
    // Parametrizacao usa cliente ADN dedicado; nao inventar endpoint SEFIN.
    throw new RealTransmissionNotReadyError();
  }

  transmitDps(signedDpsXml: string, environment: NfseEnvironment): Promise<NationalNfseResponseEnvelope> {
    return this.execute(environment, (provider) => provider.transmitDps(signedDpsXml, environment));
  }

  getNfseByAccessKey(accessKey: string, environment: NfseEnvironment): Promise<string> {
    return this.execute(environment, (provider) => provider.getNfseByAccessKey(accessKey, environment));
  }

  getDpsById(dpsId: string, environment: NfseEnvironment): Promise<string | null> {
    return this.execute(environment, (provider) => provider.getDpsById(dpsId, environment));
  }
}

/**
 * Futura fabrica para testes autenticados isolados: NAO substituir
 * getTransmissionService() automaticamente. Gate de release e rotas
 * administrativas continuam desligados ate homologacao autorizada.
 */
export function prepareRestrictedNfseTransmissionService(client: SupabaseClient): TransmissionService {
  assertRestrictedSefinEnvironment(restrictedSefinEnvironmentFromServer());
  const certificateService = getCertificateService();
  return new TransmissionService(
    createDraftRepositorySupabase(client),
    createIssuerConfigRepositorySupabase(client),
    createDpsSequenceRepositorySupabase(client),
    createIssuedNoteRepositorySupabase(client),
    createTransmissionAttemptRepositorySupabase(client),
    new RestrictedSefinProvider(client),
    certificateService,
  );
}
