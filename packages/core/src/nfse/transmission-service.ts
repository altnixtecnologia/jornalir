import { randomUUID } from "node:crypto";
import {
  buildDpsId,
  isTransmissionEnvironmentAllowed,
  isValidDpsSeriesFormat,
  type NfseIssuedNote,
  type NfseTransmissionAttempt,
} from "@ir/types";
import { buildDpsXml, parseAuthorizationResponse, parseRejectionResponse, validateDpsXmlStructure } from "./dps-builder";
import { signDpsXml } from "./signature";
import type { DraftRepository } from "./draft-repository";
import type { IssuerConfigRepository } from "./issuer-config-repository";
import type { DpsSequenceRepository } from "./dps-sequence-repository";
import type { IssuedNoteRepository } from "./issued-note-repository";
import type { TransmissionAttemptRepository } from "./transmission-attempt-repository";
import { RealTransmissionNotReadyError, type NationalNfseProvider } from "./national-nfse-provider";
import { validateNfseDraft } from "./draft-service";

export class TransmissionPermissionError extends Error {}
export class TransmissionValidationError extends Error {
  constructor(public readonly missingFields: string[]) {
    super(`Rascunho não está pronto para transmissão: ${missingFields.join("; ")}`);
  }
}
export class CertificateNotConfiguredError extends Error {
  constructor() {
    super("Certificado não configurado — transmissão bloqueada.");
  }
}
export class TransmissionEnvironmentBlockedError extends Error {}
export class AlreadyIssuedError extends Error {
  constructor(draftId: string) {
    super(`Este rascunho já tem uma NFS-e emitida (draft ${draftId}) — nunca duas autorizadas a partir do mesmo rascunho.`);
  }
}

/** Já extraída do certificado (ver certificate-provider.ts) — nunca o
 * PFX/senha bruto chega até aqui. Abstraído como interface pra
 * permitir testar o resto do fluxo com uma chave de teste, sem
 * depender da extração real de PFX (ainda não implementada). */
export interface CertificateSigningProvider {
  isConfigured(): boolean;
  getSigningKeyMaterial(): { privateKeyPem: string; certificatePem: string };
}

export interface TransmitDraftInput {
  draftId: string;
  isAdminOrOwner: boolean;
  actorProfileId?: string;
}

export interface TransmitDraftResult {
  outcome: "authorized" | "rejected" | "uncertain";
  issuedNote?: NfseIssuedNote;
  attempt: NfseTransmissionAttempt;
  rejection?: { code: string; message: string };
}

/**
 * Orquestra o fluxo completo de transmissão (Parte 2A, item 9):
 * rascunho -> validação -> reservar DPS -> montar XML -> validar
 * estruturalmente -> assinar -> transmitir -> interpretar resposta ->
 * registrar -> (se autorizada) criar nota emitida. Nunca transforma
 * rejeição em nota emitida (item 9.15); nunca retransmite
 * automaticamente em caso de falha de rede/timeout (item 11/12 —
 * devolve "uncertain" e espera confirmação explícita via consulta).
 */
export class TransmissionService {
  constructor(
    private readonly drafts: DraftRepository,
    private readonly issuerConfigs: IssuerConfigRepository,
    private readonly dpsSequences: DpsSequenceRepository,
    private readonly issuedNotes: IssuedNoteRepository,
    private readonly attempts: TransmissionAttemptRepository,
    private readonly provider: NationalNfseProvider,
    private readonly certificate: CertificateSigningProvider,
  ) {}

  async transmit(input: TransmitDraftInput): Promise<TransmitDraftResult> {
    // 1) confirmar owner/admin
    if (!input.isAdminOrOwner) throw new TransmissionPermissionError("Sem permissão para transmitir NFS-e — só owner/admin.");

    // 2) carregar rascunho
    const draft = await this.drafts.getById(input.draftId);
    if (!draft) throw new Error(`Rascunho não encontrado: ${input.draftId}`);

    // Idempotência — checagem rápida (a proteção real é a constraint
    // UNIQUE em nfse_issued_notes.draft_id, ver catch mais abaixo).
    const existingIssued = await this.issuedNotes.getByDraftId(draft.id);
    if (existingIssued) throw new AlreadyIssuedError(draft.id);

    // 4) carregar configuração fiscal
    const issuerConfig = await this.issuerConfigs.getCurrent();

    // 3) validar rascunho (usa a configuração já carregada)
    const validation = validateNfseDraft({
      clientId: draft.clientId,
      tomadorKind: draft.tomador.kind,
      tomadorName: draft.tomador.name,
      tomadorCpf: draft.tomador.cpf,
      tomadorCnpj: draft.tomador.cnpj,
      tomadorCity: draft.tomador.city,
      tomadorState: draft.tomador.state,
      serviceProfileId: draft.serviceProfileId,
      cTribNac: draft.fiscal.cTribNac,
      competencyDate: draft.competencyDate,
      serviceValue: draft.serviceValue,
      serviceDescription: draft.serviceDescription,
      issuerConfigured: Boolean(issuerConfig),
    });
    if (!issuerConfig) throw new TransmissionValidationError(["Configuração fiscal do prestador"]);
    if (!validation.readyForFutureTransmission) throw new TransmissionValidationError(validation.missingFields);

    // 5) confirmar homologação — Parte 2A SEMPRE homologação,
    // independente do que estiver salvo na configuração (item 18).
    const environment = "homologation" as const;
    if (!isTransmissionEnvironmentAllowed(environment)) {
      throw new TransmissionEnvironmentBlockedError("Transmissão em produção está bloqueada nesta fase.");
    }

    if (!issuerConfig.dpsSeries) throw new TransmissionValidationError(["Série da DPS (configuração do prestador)"]);
    if (!isValidDpsSeriesFormat(issuerConfig.dpsSeries)) {
      throw new TransmissionValidationError(["Série da DPS em formato inválido (1 a 5 dígitos numéricos)"]);
    }
    if (draft.fiscal.issqnRate === undefined) {
      throw new TransmissionValidationError(["Alíquota do ISSQN (configurar no perfil de serviço)"]);
    }
    // Algoritmo de assinatura NUNCA tem default assumido — ver
    // signature.ts (ajuste de segurança: não há confirmação oficial
    // conclusiva de qual é exigido). Bloqueia até o usuário escolher
    // explicitamente na configuração do prestador.
    if (!issuerConfig.signatureAlgorithm) {
      throw new TransmissionValidationError(["Algoritmo de assinatura (configuração do prestador — ainda sem confirmação oficial, escolha pendente)"]);
    }

    // 6) confirmar certificado
    if (!this.certificate.isConfigured()) throw new CertificateNotConfiguredError();
    const keyMaterial = this.certificate.getSigningKeyMaterial();

    // 7) reservar DPS (atômico — ver reserve_next_dps_number)
    const dpsNumber = await this.dpsSequences.reserveNext({
      issuerConfigId: issuerConfig.id,
      environment,
      series: issuerConfig.dpsSeries,
    });
    const dpsId = buildDpsId({
      ibgeCode: issuerConfig.ibgeCode,
      federalInscriptionType: "cnpj",
      federalInscription: issuerConfig.cnpj,
      series: issuerConfig.dpsSeries,
      number: dpsNumber,
    });

    // 8) montar XML
    const xml = buildDpsXml({
      issuer: issuerConfig,
      tomador: draft.tomador,
      fiscal: draft.fiscal,
      competencyDate: draft.competencyDate,
      serviceValue: draft.serviceValue,
      serviceDescription: draft.serviceDescription,
      environment,
      dpsSeries: issuerConfig.dpsSeries,
      dpsNumber,
    });

    // 9) validar estruturalmente (mínima — ver validateDpsXmlStructure)
    const structuralCheck = validateDpsXmlStructure(xml);
    if (!structuralCheck.structurallyValid) {
      throw new TransmissionValidationError(structuralCheck.issues);
    }

    // 10) assinar — algoritmo é o explicitamente configurado (nunca um default assumido, ver signature.ts).
    const signed = signDpsXml({
      xml,
      privateKeyPem: keyMaterial.privateKeyPem,
      certificatePem: keyMaterial.certificatePem,
      signatureAlgorithm: issuerConfig.signatureAlgorithm,
    });

    // 11) transmitir
    const requestReference = randomUUID();
    let envelope;
    try {
      envelope = await this.provider.transmitDps(signed.signedXml, environment);
    } catch (error) {
      // Transmissão real bloqueada de propósito (ajuste de segurança,
      // item 7) — nunca trata isso como "resultado incerto"; propaga
      // como bloqueio explícito, nunca registra tentativa alguma.
      if (error instanceof RealTransmissionNotReadyError) throw error;
      // Falha de rede/timeout DEPOIS do envio — nunca retransmite
      // automaticamente (item 11/12). Registra "uncertain" e devolve
      // pro chamador decidir (consultar a DPS antes de qualquer nova
      // tentativa).
      const attempt = await this.attempts.create({
        draftId: draft.id,
        dpsSeries: issuerConfig.dpsSeries,
        dpsNumber,
        environment,
        status: "uncertain",
        requestReference,
        responseSummary: "Falha de rede/timeout após o envio — resultado desconhecido. Consulte a DPS pela identificação antes de qualquer nova tentativa; nunca gere outra DPS automaticamente.",
      });
      return { outcome: "uncertain", attempt };
    }

    // 12) interpretar resposta + 13) registrar tentativa
    const authorization = parseAuthorizationResponse(envelope);
    if (authorization) {
      // 14) AUTORIZADA — cria registro fiscal emitido.
      let issuedNote: NfseIssuedNote;
      try {
        issuedNote = await this.issuedNotes.create({
          draftId: draft.id,
          issuerConfigId: issuerConfig.id,
          clientId: draft.clientId,
          environment,
          dpsSeries: issuerConfig.dpsSeries,
          dpsNumber,
          dpsId,
          accessKey: authorization.accessKey,
          nfseNumber: authorization.nfseNumber,
          issuedAt: authorization.issuedAt,
          competencyDate: draft.competencyDate,
          serviceValue: draft.serviceValue,
          signedDpsXml: signed.signedXml,
          nfseXml: authorization.nfseXml,
        });
      } catch (error) {
        // Proteção real de idempotência: a constraint UNIQUE em
        // nfse_issued_notes.draft_id rejeita uma segunda linha mesmo
        // se duas transmissões concorrentes chegarem até aqui.
        if (error instanceof Error && error.message.toLowerCase().includes("draft_id")) {
          throw new AlreadyIssuedError(draft.id);
        }
        throw error;
      }

      const attempt = await this.attempts.create({
        draftId: draft.id,
        dpsSeries: issuerConfig.dpsSeries,
        dpsNumber,
        environment,
        status: "authorized",
        requestReference,
        responseSummary: `Autorizada — NFS-e ${authorization.nfseNumber}.`,
        issuedNoteId: issuedNote.id,
      });

      return { outcome: "authorized", issuedNote, attempt };
    }

    // 15) REJEITADA — mantém rascunho como rascunho, nunca cria nota.
    const rejection = parseRejectionResponse(envelope) ?? { code: "UNKNOWN", message: "Rejeitada sem detalhe." };
    const attempt = await this.attempts.create({
      draftId: draft.id,
      dpsSeries: issuerConfig.dpsSeries,
      dpsNumber,
      environment,
      status: "rejected",
      requestReference,
      rejectionCode: rejection.code,
      rejectionMessage: rejection.message,
    });

    return { outcome: "rejected", attempt, rejection };
  }

  /** Consulta a DPS pelo identificador (item 11/15) — obrigatório antes
   * de qualquer nova tentativa depois de um resultado "uncertain". */
  consultDps(dpsId: string, environment: "homologation" | "production" = "homologation"): Promise<string | null> {
    return this.provider.getDpsById(dpsId, environment);
  }

  /** Consulta a NFS-e pela chave de acesso (item 15). */
  consultNfseByAccessKey(accessKey: string, environment: "homologation" | "production" = "homologation"): Promise<string> {
    return this.provider.getNfseByAccessKey(accessKey, environment);
  }
}
