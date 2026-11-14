import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NfseEnvironment } from "@ir/types";
import { RestrictedCancellationDispatchService } from "@ir/core/src/nfse/cancellation-dispatch-service";
import type { CancellationEventProvider } from "@ir/core/src/nfse/cancellation-service";
import { SefinNacionalClient, type NationalEventResponseEnvelope } from "@ir/core/src/nfse/sefin-nacional-client";
import { createMutualTlsDispatcher } from "@ir/core/src/nfse/mutual-tls";
import { createIssuedNoteRepositorySupabase } from "../providers/supabase/nfseIssuedNoteRepository.supabase";
import { createIssuerConfigRepositorySupabase } from "../providers/supabase/nfseIssuerConfigRepository.supabase";
import { createCancellationSubmissionRepositorySupabase } from "../providers/supabase/nfseCancellationSubmissionRepository.supabase";
import { getIssuerConfigService, getCertificateService } from "./nfse";
import { assertRestrictedSefinEnvironment, restrictedSefinEnvironmentFromServer } from "../lib/nfse/restrictedSefinGate";

/** Esta factory e APENAS PREPARACAO, nao tem Server Action que a importe.
 * A1 e mTLS nunca sao acessiveis ao navegador.
 */
class RestrictedCancellationEventProvider implements CancellationEventProvider {
  constructor(private readonly session: SupabaseClient) {}

  private async run<T>(environment: NfseEnvironment, task: (client: SefinNacionalClient) => Promise<T>): Promise<T> {
    assertRestrictedSefinEnvironment(restrictedSefinEnvironmentFromServer());
    if (environment !== "homologation") throw new Error("Cancelamento de produção está bloqueado.");
    const issuer = await getIssuerConfigService(this.session).getCurrent();
    if (!issuer || issuer.environment !== "homologation") throw new Error("Emitente não está na Produção Restrita.");
    const keys = await getCertificateService().getActiveSigningMaterial(issuer.id);
    if (!keys) throw new Error("Certificado A1 não disponível.");
    const dispatcher = createMutualTlsDispatcher(keys.certificatePem, keys.privateKeyPem);
    try {
      return await task(new SefinNacionalClient(dispatcher));
    } finally {
      await dispatcher.close();
    }
  }

  submitCancellationEvent(signedXml: string, accessKey: string, environment: NfseEnvironment): Promise<NationalEventResponseEnvelope> {
    return this.run(environment, (client) => client.submitCancellationEvent(signedXml, accessKey, environment));
  }

  getEventsByAccessKey(accessKey: string, environment: NfseEnvironment, filter?: { eventType?: string; sequence?: number }): Promise<string> {
    return this.run(environment, (client) => client.getEventsByAccessKey(accessKey, environment, filter));
  }
}

export function prepareRestrictedCancellationDispatchService(
  client: SupabaseClient,
): RestrictedCancellationDispatchService {
  // Dupla seguranca: bloqueio no momento de montar e em CADA requisicao.
  assertRestrictedSefinEnvironment(restrictedSefinEnvironmentFromServer());
  return new RestrictedCancellationDispatchService(
    createIssuedNoteRepositorySupabase(client),
    createCancellationSubmissionRepositorySupabase(client),
    createIssuerConfigRepositorySupabase(client),
    getCertificateService(),
    new RestrictedCancellationEventProvider(client),
  );
}
