import { randomUUID } from "node:crypto";
import { buildDpsId, isTransmissionEnvironmentAllowed, isValidDpsSeriesFormat, type NfseCertificateInfo, type NfseIssuedNote, type NfseTransmissionAttempt } from "@ir/types";
import { buildDpsXml, parseAuthorizationResponse, parseRejectionResponse, validateDpsXmlStructure } from "./dps-builder";
import { signDpsXml } from "./signature";
import { validateDpsAgainstOfficialXsd } from "./xsd-validator";
import { checkHomologationReadiness } from "./readiness";
import type { DraftRepository } from "./draft-repository";
import type { IssuerConfigRepository } from "./issuer-config-repository";
import type { DpsSequenceRepository } from "./dps-sequence-repository";
import type { IssuedNoteRepository } from "./issued-note-repository";
import type { TransmissionAttemptRepository } from "./transmission-attempt-repository";
import { RealTransmissionNotReadyError, type NationalNfseProvider } from "./national-nfse-provider";
import { validateNfseDraft } from "./draft-service";

/** O que o fluxo de transmissão precisa do certificado — `CertificateService`
 * (certificate-service.ts) satisfaz esta forma estruturalmente; testes usam
 * um dublê mais simples, sem precisar de um `CertificateRepository` real. */
export interface CertificateMaterialProvider {
  getActiveInfo(issuerConfigId: string): Promise<NfseCertificateInfo | null>;
  getActiveSigningMaterial(issuerConfigId: string): Promise<{ privateKeyPem: string; certificatePem: string } | null>;
}

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
 * Orquestra o fluxo completo de transmissão (Parte 2A, item 9 → Parte
 * 2B): rascunho -> validação -> reservar DPS -> montar XML -> validar
 * estruturalmente -> assinar -> transmitir -> interpretar resposta ->
 * registrar -> (se autorizada) criar nota emitida. Nunca transforma
 * rejeição em nota emitida; nunca retransmite automaticamente em caso
 * de falha de rede/timeout (devolve "uncertain").
 *
 * AJUSTE (Parte 2B): o algoritmo de assinatura NÃO é mais escolhido
 * pelo usuário (ver signature.ts — perfil oficial fixo, confirmado).
 * O certificado agora vem de `CertificateService` (PFX validado +
 * armazenado criptografado), nunca de variável de ambiente. A guarda
 * central de prontidão (validação XSD real + checklist completo pra
 * UI) é `checkReadiness()`, abaixo — separada de `transmit()` de
 * propósito (ver nota no corpo do método).
 */
export class TransmissionService {
  constructor(
    private readonly drafts: DraftRepository,
    private readonly issuerConfigs: IssuerConfigRepository,
    private readonly dpsSequences: DpsSequenceRepository,
    private readonly issuedNotes: IssuedNoteRepository,
    private readonly attempts: TransmissionAttemptRepository,
    private readonly provider: NationalNfseProvider,
    private readonly certificates: CertificateMaterialProvider,
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

    // Série precisa estar válida ANTES de reservar um número — nunca
    // desperdiça um número de sequência por uma configuração incompleta.
    if (!issuerConfig.dpsSeries) throw new TransmissionValidationError(["Série da DPS (configuração do prestador)"]);
    if (!isValidDpsSeriesFormat(issuerConfig.dpsSeries)) {
      throw new TransmissionValidationError(["Série da DPS em formato inválido (1 a 5 dígitos numéricos)"]);
    }

    // 6) confirmar certificado (só presença/metadata aqui — a chave
    // privada só é decifrada mais tarde, imediatamente antes de assinar).
    const certificateInfo = await this.certificates.getActiveInfo(issuerConfig.id);
    if (!certificateInfo) throw new CertificateNotConfiguredError();

    // 7) reservar DPS (atômico — ver reserve_next_dps_number)
    const dpsSeries = issuerConfig.dpsSeries;
    const dpsNumber = await this.dpsSequences.reserveNext({
      issuerConfigId: issuerConfig.id,
      environment,
      series: dpsSeries,
    });
    const dpsId = buildDpsId({
      ibgeCode: issuerConfig.ibgeCode,
      federalInscriptionType: "cnpj",
      federalInscription: issuerConfig.cnpj,
      series: dpsSeries,
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
      dpsSeries,
      dpsNumber,
    });

    // 7) validar estruturalmente (mínima — ver validateDpsXmlStructure)
    const structuralCheck = validateDpsXmlStructure(xml);
    if (!structuralCheck.structurallyValid) {
      throw new TransmissionValidationError(structuralCheck.issues);
    }

    // NOTA: a guarda central de prontidão (readiness.ts, inclui a
    // validação XSD real) é exposta separadamente via `checkReadiness()`
    // — pra UI mostrar "Emissão em homologação ainda não está pronta" +
    // itens faltantes (item 7 da Parte 2B). NÃO é chamada aqui dentro:
    // o bloqueio de uma chamada real à API nacional já é feito de forma
    // incondicional e independente por `RealTransmissionNotReadyError`
    // (ver national-nfse-provider.ts) — nunca duplicado/contornável
    // aqui. Mantém esta orquestração testável com um provider fake,
    // sem depender de o builder já ser 100% conforme ao XSD oficial
    // (gap conhecido, ver dps-builder.ts).

    // Certificado JÁ confirmado presente (passo 6) — SÓ AGORA decifra a chave privada (nunca antes).
    const keyMaterial = await this.certificates.getActiveSigningMaterial(issuerConfig.id);
    if (!keyMaterial) throw new CertificateNotConfiguredError();

    // 13) assinar — perfil oficial fixo (NFSE_DPS_SIGNATURE_PROFILE em signature.ts).
    const signed = signDpsXml({
      xml,
      privateKeyPem: keyMaterial.privateKeyPem,
      certificatePem: keyMaterial.certificatePem,
    });

    // 14) transmitir
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
        dpsSeries,
        dpsNumber,
        environment,
        status: "uncertain",
        requestReference,
        responseSummary: "Falha de rede/timeout após o envio — resultado desconhecido. Consulte a DPS pela identificação antes de qualquer nova tentativa; nunca gere outra DPS automaticamente.",
      });
      return { outcome: "uncertain", attempt };
    }

    // 15) interpretar resposta + 16) registrar tentativa
    const authorization = parseAuthorizationResponse(envelope);
    if (authorization) {
      // 17) AUTORIZADA — cria registro fiscal emitido.
      let issuedNote: NfseIssuedNote;
      try {
        issuedNote = await this.issuedNotes.create({
          draftId: draft.id,
          issuerConfigId: issuerConfig.id,
          clientId: draft.clientId,
          environment,
          dpsSeries,
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
        dpsSeries,
        dpsNumber,
        environment,
        status: "authorized",
        requestReference,
        responseSummary: `Autorizada — NFS-e ${authorization.nfseNumber}.`,
        issuedNoteId: issuedNote.id,
      });

      return { outcome: "authorized", issuedNote, attempt };
    }

    // 18) REJEITADA — mantém rascunho como rascunho, nunca cria nota.
    const rejection = parseRejectionResponse(envelope) ?? { code: "UNKNOWN", message: "Rejeitada sem detalhe." };
    const attempt = await this.attempts.create({
      draftId: draft.id,
      dpsSeries,
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

  /**
   * Guarda CENTRAL de prontidão pra UI (Parte 2B, item "Transmissão
   * continua bloqueada") — monta a DPS de um rascunho específico e
   * roda a validação XSD real contra ela, junto com o resto do
   * checklist (readiness.ts). NUNCA reserva um número de DPS (só
   * monta o XML com um número fictício "0" pra validação — a reserva
   * real só acontece em `transmit()`). Resultado pensado pra exibir
   * "Emissão em homologação ainda não está pronta" + a lista exata do
   * que falta, nunca uma mensagem genérica.
   */
  async checkReadiness(draftId: string): Promise<{ ready: boolean; missing: string[] }> {
    const draft = await this.drafts.getById(draftId);
    if (!draft) return { ready: false, missing: ["Rascunho não encontrado"] };

    const issuerConfig = await this.issuerConfigs.getCurrent();
    const activeCertificate = issuerConfig ? await this.certificates.getActiveInfo(issuerConfig.id) : null;

    let lastXsdValidationValid: boolean | null = null;
    if (issuerConfig?.dpsSeries) {
      const xml = buildDpsXml({
        issuer: issuerConfig,
        tomador: draft.tomador,
        fiscal: draft.fiscal,
        competencyDate: draft.competencyDate,
        serviceValue: draft.serviceValue,
        serviceDescription: draft.serviceDescription,
        environment: "homologation",
        dpsSeries: issuerConfig.dpsSeries,
        dpsNumber: 1,
      });
      const xsdResult = await validateDpsAgainstOfficialXsd(xml);
      lastXsdValidationValid = xsdResult.valid;
    }

    return checkHomologationReadiness({
      issuerConfig,
      activeCertificate,
      lastXsdValidationValid,
      cTribNacConfigured: Boolean(draft.fiscal.cTribNac),
    });
  }
}
